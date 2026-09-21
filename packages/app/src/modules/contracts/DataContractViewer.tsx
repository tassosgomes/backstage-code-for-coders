import { useMemo } from 'react';
import { parse as parseYaml } from 'yaml';
import {
  Box,
  Chip,
  Grid,
  Link,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
  makeStyles,
} from '@material-ui/core';
import { InfoCard } from '@backstage/core-components';

const STATUS_COLOR: Record<
  string,
  'default' | 'primary' | 'secondary' | undefined
> = {
  draft: 'secondary',
  active: 'primary',
  production: 'primary',
  stable: 'primary',
  deprecated: 'default',
  retired: 'default',
};

const KNOWN_KEYS = new Set([
  'apiVersion',
  'kind',
  'id',
  'name',
  'version',
  'status',
  'domain',
  'dataProduct',
  'description',
  'schema',
  'tags',
  'notes',
]);

const CONSTRAINT_LABELS: Record<string, string> = {
  primaryKey: 'PK',
  primary: 'PK',
  unique: 'único',
  nullable: 'nullable',
  required: '',
  name: '',
  logicalType: '',
  physicalType: '',
  description: '',
};

const useStyles = makeStyles(theme => ({
  label: {
    fontWeight: 600,
    color: theme.palette.text.secondary,
  },
  mono: {
    fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
    fontSize: '0.85rem',
  },
  bulletList: {
    margin: 0,
    paddingLeft: theme.spacing(3),
  },
}));

function KeyValueRows({ entries }: { entries: [string, unknown][] }) {
  const classes = useStyles();
  return (
    <Table size="small">
      <TableBody>
        {entries.map(([key, value]) => (
          <TableRow key={key}>
            <TableCell className={classes.label} width="35%">
              {key}
            </TableCell>
            <TableCell>
              <ScalarValue value={value} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ScalarValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <Typography variant="body2">—</Typography>;
  }
  if (typeof value === 'boolean') {
    return <Typography variant="body2">{value ? 'sim' : 'não'}</Typography>;
  }
  if (typeof value === 'number') {
    return <Typography variant="body2">{value}</Typography>;
  }
  if (Array.isArray(value)) {
    return (
      <Typography variant="body2">
        {value.map(v => String(v)).join(', ')}
      </Typography>
    );
  }
  if (typeof value === 'object') {
    return (
      <Box>
        <KeyValueRows entries={Object.entries(value as object)} />
      </Box>
    );
  }
  if (/^https?:\/\//.test(String(value))) {
    return (
      <Link href={String(value)} target="_blank" rel="noopener">
        {String(value)}
      </Link>
    );
  }
  return <Typography variant="body2">{String(value)}</Typography>;
}

function constraintsOf(property: Record<string, any>): string[] {
  const constraints: string[] = [];
  for (const [key, value] of Object.entries(property)) {
    const label = CONSTRAINT_LABELS[key];
    if (label === undefined) {
      constraints.push(
        value === true
          ? key
          : `${key}: ${
              Array.isArray(value) ? value.join(' | ') : String(value)
            }`,
      );
    } else if (label !== '') {
      constraints.push(label);
    }
  }
  return constraints;
}

function SchemaPropertiesTable({
  properties,
}: {
  properties: Record<string, any>[];
}) {
  const classes = useStyles();
  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell>Campo</TableCell>
          <TableCell>Tipo</TableCell>
          <TableCell>Obrigatório</TableCell>
          <TableCell>Descrição</TableCell>
          <TableCell>Regras</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {properties.map((property, index) => (
          <TableRow key={property.name ?? index}>
            <TableCell className={classes.mono}>
              {String(property.name ?? '—')}
            </TableCell>
            <TableCell>
              {String(
                property.logicalType ??
                  property.physicalType ??
                  property.type ??
                  '—',
              )}
            </TableCell>
            <TableCell>
              {property.required ? (
                <Chip label="obrigatório" color="primary" size="small" />
              ) : (
                <Chip label="opcional" size="small" />
              )}
            </TableCell>
            <TableCell>
              <Typography variant="body2">
                {property.description ?? '—'}
              </Typography>
            </TableCell>
            <TableCell>
              {constraintsOf(property).map(constraint => (
                <Chip
                  key={constraint}
                  label={constraint}
                  size="small"
                  variant="outlined"
                  style={{ margin: 1 }}
                />
              ))}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function toSchemaItems(schema: any): Record<string, any>[] {
  if (!schema) {
    return [];
  }
  return Array.isArray(schema) ? schema : [schema];
}

function SchemaSection({ schema }: { schema: any }) {
  const items: Record<string, any>[] = toSchemaItems(schema);
  return (
    <>
      {items.map((item, index) => (
        <Box key={item.name ?? index} marginBottom={items.length > 1 ? 3 : 0}>
          <InfoCard title={`Modelo de dados — ${item.name ?? `#${index + 1}`}`}>
            {item.description && (
              <Typography variant="body2" paragraph>
                {item.description}
              </Typography>
            )}
            {item.properties && (
              <SchemaPropertiesTable properties={item.properties} />
            )}
            {!item.properties && (
              <KeyValueRows
                entries={Object.entries(item).filter(
                  ([k]) => k !== 'name' && k !== 'description',
                )}
              />
            )}
          </InfoCard>
        </Box>
      ))}
    </>
  );
}

function GenericSection({ title, value }: { title: string; value: unknown }) {
  const classes = useStyles();
  let content: React.ReactNode = null;
  if (Array.isArray(value)) {
    const objectRows = value.filter(
      v => v && typeof v === 'object' && !Array.isArray(v),
    ) as Record<string, any>[];
    if (objectRows.length === value.length && objectRows.length > 0) {
      const columns = Array.from(
        new Set(objectRows.flatMap(row => Object.keys(row))),
      );
      content = (
        <Table size="small">
          <TableHead>
            <TableRow>
              {columns.map(column => (
                <TableCell key={column}>{column}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {objectRows.map((row, index) => (
              <TableRow key={index}>
                {columns.map(column => (
                  <TableCell key={column}>
                    <ScalarValue value={row[column]} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      );
    } else {
      content = (
        <ul className={classes.bulletList}>
          {value.map((item, index) => (
            <li key={index}>
              <ScalarValue value={item} />
            </li>
          ))}
        </ul>
      );
    }
  } else if (value && typeof value === 'object') {
    content = <KeyValueRows entries={Object.entries(value as object)} />;
  } else {
    content = <ScalarValue value={value} />;
  }

  return <InfoCard title={title}>{content}</InfoCard>;
}

const SECTION_TITLES: Record<string, string> = {
  parties: 'Partes envolvidas',
  servicelevels: 'Níveis de serviço (SLA)',
  serviceLevels: 'Níveis de service (SLA)',
  quality: 'Expectativas de qualidade',
  support: 'Suporte',
  price: 'Preço / cobrança',
  links: 'Links',
  contactDetails: 'Contato',
  servers: 'Servidores',
  notices: 'Avisos',
  limitations: 'Limitações',
};

export function DataContractViewer({ definition }: { definition: string }) {
  const classes = useStyles();

  const parsed = useMemo(() => {
    try {
      const result = parseYaml(definition);
      return result && typeof result === 'object'
        ? (result as Record<string, any>)
        : undefined;
    } catch {
      return undefined;
    }
  }, [definition]);

  if (!parsed) {
    return (
      <InfoCard title="Data Contract">
        <Typography>
          Não foi possível interpretar este contrato como ODCS (YAML/JSON
          válido). Use o botão “Raw” para ver o arquivo original.
        </Typography>
      </InfoCard>
    );
  }

  const description =
    typeof parsed.description === 'object'
      ? parsed.description
      : { purpose: parsed.description };

  const overviewEntries = (
    [
      ['Identificador', parsed.id],
      ['Versão do contrato', parsed.version],
      ['Status', parsed.status],
      ['Domínio', parsed.domain],
      ['Data product', parsed.dataProduct],
      ['Padrão (ODCS)', parsed.apiVersion],
      ['Kind', parsed.kind],
    ] as [string, unknown][]
  ).filter(([, value]) => value !== undefined && value !== null);

  const otherSections = Object.entries(parsed).filter(
    ([key, value]) =>
      !KNOWN_KEYS.has(key) &&
      value !== undefined &&
      value !== null &&
      value !== '' &&
      !(Array.isArray(value) && value.length === 0),
  );

  return (
    <Grid container spacing={3}>
      <Grid item xs={12}>
        <InfoCard title="Visão geral">
          <KeyValueRows entries={overviewEntries} />
          {parsed.status && (
            <Box marginTop={2}>
              <Chip
                label={`status: ${parsed.status}`}
                color={STATUS_COLOR[parsed.status] ?? 'default'}
                size="small"
              />
            </Box>
          )}
        </InfoCard>
      </Grid>

      {(description.purpose ||
        description.usage ||
        description.description) && (
        <Grid item xs={12}>
          <InfoCard title="Propósito e uso">
            {description.purpose && (
              <>
                <Typography className={classes.label}>Propósito</Typography>
                <Typography variant="body2" paragraph>
                  {description.purpose}
                </Typography>
              </>
            )}
            {description.usage && (
              <>
                <Typography className={classes.label}>Uso</Typography>
                <Typography variant="body2" paragraph>
                  {description.usage}
                </Typography>
              </>
            )}
          </InfoCard>
        </Grid>
      )}

      {parsed.schema && (
        <Grid item xs={12}>
          <SchemaSection schema={parsed.schema} />
        </Grid>
      )}

      {otherSections.map(([key, value]) => (
        <Grid item xs={12} key={key}>
          <GenericSection title={SECTION_TITLES[key] ?? key} value={value} />
        </Grid>
      ))}

      {parsed.notes && (
        <Grid item xs={12}>
          <InfoCard title="Notas">
            {Array.isArray(parsed.notes) ? (
              parsed.notes.map((note: unknown, index: number) => (
                <Typography key={index} variant="body2" paragraph>
                  • {String(note)}
                </Typography>
              ))
            ) : (
              <Typography variant="body2">{String(parsed.notes)}</Typography>
            )}
          </InfoCard>
        </Grid>
      )}
    </Grid>
  );
}
