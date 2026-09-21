import { createHash } from 'node:crypto';
import {
  ANNOTATION_LOCATION,
  ANNOTATION_ORIGIN_LOCATION,
  ANNOTATION_SOURCE_LOCATION,
  ANNOTATION_VIEW_URL,
  type ApiEntity,
} from '@backstage/catalog-model';
import type { DeferredEntity } from '@backstage/plugin-catalog-node';
import { parse as parseYaml } from 'yaml';

export const CONTRACT_FORMAT_ANNOTATION = 'code-for-coders.com/contract-format';
export const CONTRACT_SPEC_VERSION_ANNOTATION =
  'code-for-coders.com/contract-spec-version';
export const CONTRACT_VERSION_ANNOTATION =
  'code-for-coders.com/contract-version';
export const CONTRACT_FILE_PATH_ANNOTATION =
  'code-for-coders.com/contract-file-path';
export const CONTRACT_SOURCE_ANNOTATION = 'code-for-coders.com/contract-source';

export type ContractFormat = 'openapi' | 'asyncapi' | 'datacontract';

export interface ClassifiedContract {
  format: ContractFormat;
  parsed: Record<string, any>;
  specVersion?: string;
}

export function parseContractFile(content: string): any | undefined {
  try {
    return JSON.parse(content);
  } catch {
    /* try YAML below */
  }
  try {
    const result = parseYaml(content);
    return result && typeof result === 'object' ? result : undefined;
  } catch {
    return undefined;
  }
}

export function classifyContract(parsed: any): ClassifiedContract | undefined {
  if (!parsed || typeof parsed !== 'object') {
    return undefined;
  }
  if (typeof parsed.asyncapi === 'string') {
    return { format: 'asyncapi', parsed, specVersion: parsed.asyncapi };
  }
  if (typeof parsed.openapi === 'string') {
    return { format: 'openapi', parsed, specVersion: parsed.openapi };
  }
  if (typeof parsed.apiVersion === 'string' && parsed.kind === 'DataContract') {
    return { format: 'datacontract', parsed, specVersion: parsed.apiVersion };
  }
  return undefined;
}

export function slugifyName(input: string): string {
  const slug = input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
  return slug || 'contract';
}

function uniqueName(base: string, used: Set<string>): string {
  let name = base;
  let counter = 2;
  while (used.has(name)) {
    const suffix = `-${counter}`;
    name = base.slice(0, 63 - suffix.length) + suffix;
    counter += 1;
  }
  used.add(name);
  return name;
}

export interface BuildEntityOptions {
  classified: ClassifiedContract;
  filePath: string;
  fileName: string;
  content: string;
  sourceName: string;
  sourceUrl: string;
  managedBy: string;
  defaultOwner: string;
  usedNames: Set<string>;
}

export function buildContractEntity(
  options: BuildEntityOptions,
): DeferredEntity | undefined {
  const { classified, content, managedBy, defaultOwner, usedNames } = options;
  const { format, parsed, specVersion } = classified;

  const title =
    (typeof parsed.info?.title === 'string' && parsed.info.title) ||
    (typeof parsed.name === 'string' && parsed.name) ||
    options.fileName;

  const name = uniqueName(slugifyName(title), usedNames);

  let description: string | undefined;
  if (typeof parsed.info?.description === 'string') {
    description = parsed.info.description;
  } else if (parsed.description && typeof parsed.description === 'object') {
    const parts = [parsed.description.purpose, parsed.description.usage].filter(
      (p): p is string => typeof p === 'string' && p.length > 0,
    );
    if (parts.length > 0) {
      description = parts.join('\n\n');
    }
  } else if (typeof parsed.description === 'string') {
    description = parsed.description;
  }

  const ownerRef =
    (typeof parsed.info?.['x-owner'] === 'string' && parsed.info['x-owner']) ||
    defaultOwner;

  const lifecycle =
    format === 'datacontract' && typeof parsed.status === 'string'
      ? parsed.status
      : (typeof parsed.info?.['x-lifecycle'] === 'string' &&
          parsed.info['x-lifecycle']) ||
        'production';

  const version =
    (typeof parsed.info?.version === 'string' && parsed.info.version) ||
    (typeof parsed.version === 'string' && parsed.version) ||
    undefined;

  const tags: string[] = [];
  for (const candidate of [parsed.domain, parsed.dataProduct]) {
    if (typeof candidate === 'string' && candidate.length > 0) {
      const tag = slugifyName(candidate);
      if (tag && !tags.includes(tag)) {
        tags.push(tag);
      }
    }
  }

  const entity: ApiEntity = {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'API',
    metadata: {
      namespace: 'default',
      name,
      title,
      description,
      tags: tags.length > 0 ? tags : undefined,
      etag: createHash('sha1').update(content).digest('hex'),
      annotations: {
        [ANNOTATION_LOCATION]: managedBy,
        [ANNOTATION_ORIGIN_LOCATION]: managedBy,
        [ANNOTATION_SOURCE_LOCATION]: `url:${options.sourceUrl}`,
        [ANNOTATION_VIEW_URL]: `url:${options.sourceUrl}`,
        [CONTRACT_FORMAT_ANNOTATION]: format,
        [CONTRACT_SPEC_VERSION_ANNOTATION]: specVersion ?? 'unknown',
        [CONTRACT_FILE_PATH_ANNOTATION]: options.filePath,
        [CONTRACT_SOURCE_ANNOTATION]: options.sourceName,
        ...(version ? { [CONTRACT_VERSION_ANNOTATION]: version } : {}),
      },
    },
    spec: {
      type: format,
      lifecycle,
      owner: ownerRef,
      definition: content,
    },
  };

  return { entity, locationKey: managedBy };
}
