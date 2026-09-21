import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Config } from '@backstage/config';
import {
  type DeferredEntity,
  type EntityProvider,
  type EntityProviderConnection,
} from '@backstage/plugin-catalog-node';
import type {
  LoggerService,
  SchedulerService,
  SchedulerServiceTaskRunner,
} from '@backstage/backend-plugin-api';
import { minimatch } from 'minimatch';
import {
  buildContractEntity,
  classifyContract,
  parseContractFile,
} from './classify';

const DEFAULT_INCLUDES = ['**/*.yaml', '**/*.yml', '**/*.json'];
const DEFAULT_EXCLUDES = [
  '.agents/**',
  '.github/**',
  '.vscode/**',
  '.config/**',
  '.tsg/**',
  '.git/**',
  'node_modules/**',
  '**/node_modules/**',
  '**/templates/**',
  '**/template/**',
];

export interface ContractFile {
  /** Path relative to the source root, e.g. `tasks/prd-x/asyncapi-contract.yaml` */
  path: string;
  content: string;
  /** Absolute or remote URL where the file can be viewed */
  url: string;
}

async function listGitHubFiles(
  repoUrl: URL,
  branch: string,
  token: string | undefined,
  includes: string[],
  excludes: string[],
  logger: LoggerService,
): Promise<ContractFile[]> {
  const owner = repoUrl.pathname.split('/').filter(Boolean)[0];
  const repo = repoUrl.pathname
    .split('/')
    .filter(Boolean)[1]
    ?.replace(/\.git$/, '');
  if (!owner || !repo) {
    throw new Error(`Could not parse owner/repo from ${repoUrl.toString()}`);
  }

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const api = async (pathname: string): Promise<any> => {
    const res = await fetch(`https://api.github.com${pathname}`, { headers });
    if (!res.ok) {
      throw new Error(
        `GitHub API ${res.status} for ${pathname}: ${await res.text()}`,
      );
    }
    return res.json();
  };

  const tree = await api(
    `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(
      branch,
    )}?recursive=1`,
  );
  const blobs: { path: string; sha: string }[] = (tree.tree ?? [])
    .filter(
      (entry: any) =>
        entry.type === 'blob' && matches(entry.path, includes, excludes),
    )
    .map((entry: any) => ({ path: entry.path as string, sha: entry.sha }));

  logger.info(
    `GitHub scan of ${owner}/${repo}@${branch}: ${blobs.length} candidate contract files`,
  );

  const files: ContractFile[] = [];
  const chunkSize = 8;
  for (let i = 0; i < blobs.length; i += chunkSize) {
    const chunk = blobs.slice(i, i + chunkSize);
    const results = await Promise.all(
      chunk.map(async blob => {
        const data = await api(`/repos/${owner}/${repo}/git/blobs/${blob.sha}`);
        if (data.encoding !== 'base64' || typeof data.content !== 'string') {
          return undefined;
        }
        return {
          path: blob.path,
          content: Buffer.from(data.content, 'base64').toString('utf8'),
          url: `https://github.com/${owner}/${repo}/blob/${branch}/${blob.path}`,
        } satisfies ContractFile;
      }),
    );
    files.push(...results.filter((f): f is ContractFile => f !== undefined));
  }
  return files;
}

async function listLocalFiles(
  dir: string,
  includes: string[],
  excludes: string[],
  logger: LoggerService,
): Promise<ContractFile[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: false });
  const candidates = entries
    .map((entry: any) => (typeof entry === 'string' ? entry : entry.name))
    .filter(
      (relative: string) =>
        minimatch(relative, '**/*', { dot: true }) &&
        matches(relative, includes, excludes),
    );

  logger.info(
    `Local scan of ${dir}: ${candidates.length} candidate contract files`,
  );

  const files: ContractFile[] = [];
  for (const relative of candidates) {
    try {
      const content = await readFile(path.join(dir, relative), 'utf8');
      files.push({
        path: relative,
        content,
        url: `file://${path.join(dir, relative)}`,
      });
    } catch (error) {
      logger.warn(`Failed to read ${relative}: ${error}`);
    }
  }
  return files;
}

function readGithubToken(config: Config, host: string): string | undefined {
  const integrations =
    config.getOptionalConfigArray('integrations.github') ?? [];
  for (const integration of integrations) {
    if ((integration.getOptionalString('host') ?? 'github.com') === host) {
      const token = integration.getOptionalString('token');
      if (token) {
        return token;
      }
    }
  }
  return undefined;
}

function matches(
  filePath: string,
  includes: string[],
  excludes: string[],
): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  const included = includes.some(pattern =>
    minimatch(normalized, pattern, { dot: true }),
  );
  if (!included) {
    return false;
  }
  return !excludes.some(pattern =>
    minimatch(normalized, pattern, { dot: true }),
  );
}

export class ContractsEntityProvider implements EntityProvider {
  static fromConfig(
    config: Config,
    options: { logger: LoggerService; scheduler: SchedulerService },
  ): ContractsEntityProvider | undefined {
    const contractsConfig = config.getOptionalConfig('contracts');
    if (!contractsConfig) {
      options.logger.info(
        'No `contracts` configuration found, contracts provider disabled',
      );
      return undefined;
    }

    const source = contractsConfig.getOptionalString('source') ?? 'github';
    const defaultOwner =
      contractsConfig.getOptionalString('owner') ?? 'group:default/platform';
    const includes =
      contractsConfig.getOptionalStringArray('include') ?? DEFAULT_INCLUDES;
    const excludes =
      contractsConfig.getOptionalStringArray('exclude') ?? DEFAULT_EXCLUDES;
    const scheduleConfig = contractsConfig.getOptionalConfig('schedule');
    const schedule: SchedulerServiceTaskRunner =
      options.scheduler.createScheduledTaskRunner({
        frequency: scheduleConfig?.getOptional('frequency') ?? {
          minutes: 15,
        },
        timeout: scheduleConfig?.getOptional('timeout') ?? { minutes: 5 },
        initialDelay: scheduleConfig?.getOptional('initialDelay') ?? {
          seconds: 20,
        },
      });

    if (source === 'local') {
      const dir = contractsConfig.getOptionalString('local.dir');
      if (!dir) {
        throw new Error(
          'contracts.source is "local" but contracts.local.dir is not set',
        );
      }
      return new ContractsEntityProvider({
        sourceName: 'local',
        managedBy: `url:file:${path.resolve(process.cwd(), dir)}`,
        listFiles: logger =>
          listLocalFiles(
            path.resolve(process.cwd(), dir),
            includes,
            excludes,
            logger,
          ),
        defaultOwner,
        schedule,
        logger: options.logger,
      });
    }

    const repoUrlString =
      contractsConfig.getOptionalString('github.repo') ??
      'https://github.com/tassosgomes/code-for-coders';
    const branch = contractsConfig.getOptionalString('github.branch') ?? 'main';
    const repoUrl = new URL(repoUrlString);
    const token = readGithubToken(config, repoUrl.hostname);

    return new ContractsEntityProvider({
      sourceName: `${repoUrl.pathname
        .replace(/\.git$/, '')
        .replace(/^\//, '')}@${branch}`,
      managedBy: `url:${repoUrlString.replace(/\.git$/, '')}/tree/${branch}`,
      listFiles: logger =>
        listGitHubFiles(repoUrl, branch, token, includes, excludes, logger),
      defaultOwner,
      schedule,
      logger: options.logger,
    });
  }

  readonly #sourceName: string;
  readonly #managedBy: string;
  readonly #listFiles: (logger: LoggerService) => Promise<ContractFile[]>;
  readonly #defaultOwner: string;
  readonly #logger: LoggerService;
  readonly #schedule: SchedulerServiceTaskRunner;

  constructor(options: {
    sourceName: string;
    managedBy: string;
    listFiles: (logger: LoggerService) => Promise<ContractFile[]>;
    defaultOwner: string;
    schedule: SchedulerServiceTaskRunner;
    logger: LoggerService;
  }) {
    this.#sourceName = options.sourceName;
    this.#managedBy = options.managedBy;
    this.#listFiles = options.listFiles;
    this.#defaultOwner = options.defaultOwner;
    this.#logger = options.logger;
    this.#schedule = options.schedule;
  }

  getProviderName(): string {
    return `ContractsEntityProvider:${this.#sourceName}`;
  }

  async connect(connection: EntityProviderConnection): Promise<void> {
    const id = `${this.getProviderName()}:refresh`;

    await this.#schedule.run({
      id,
      fn: async () => {
        const logger = this.#logger.child({
          taskId: id,
          taskInstanceId: randomUUID(),
        });
        try {
          const entities = await this.read({ logger });
          logger.info(`Collected ${entities.length} contract entities`);
          await connection.applyMutation({
            type: 'full',
            entities,
          });
        } catch (error) {
          logger.error(`Contracts refresh failed: ${error}`);
        }
      },
    });
  }

  async read(options: { logger: LoggerService }): Promise<DeferredEntity[]> {
    const { logger } = options;
    const files = await this.#listFiles(logger);

    const usedNames = new Set<string>();
    const entities: DeferredEntity[] = [];
    for (const file of files) {
      const parsed = parseContractFile(file.content);
      const classified = parsed ? classifyContract(parsed) : undefined;
      if (!classified) {
        logger.debug(
          `Skipping ${file.path}: not an OpenAPI, AsyncAPI or ODCS contract`,
        );
        continue;
      }
      const entity = buildContractEntity({
        classified,
        filePath: file.path,
        fileName: path.basename(file.path),
        content: file.content,
        sourceName: this.#sourceName,
        sourceUrl: file.url,
        managedBy: this.#managedBy,
        defaultOwner: this.#defaultOwner,
        usedNames,
      });
      if (entity) {
        entities.push(entity);
        logger.debug(
          `Ingested ${classified.format} contract from ${file.path}`,
        );
      }
    }

    if (entities.length === 0) {
      logger.warn(
        `No contracts found in ${
          this.#sourceName
        } — the catalog will not be updated`,
      );
      return entities;
    }

    return entities;
  }
}
