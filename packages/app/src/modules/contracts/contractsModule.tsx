import type { ApiEntity } from '@backstage/catalog-model';
import {
  ApiBlueprint,
  createFrontendModule,
} from '@backstage/frontend-plugin-api';
import {
  apiDocsConfigRef,
  defaultDefinitionWidgets,
  type ApiDefinitionWidget,
} from '@backstage/plugin-api-docs';
import { DataContractViewer } from './DataContractViewer';

export const DATA_CONTRACT_TYPE = 'datacontract';

/**
 * Extends the api-docs plugin with a human-readable renderer for
 * ODCS (Open Data Contract Standard) contracts stored as API entities.
 * OpenAPI and AsyncAPI keep their built-in renderers.
 */
export const contractsModule = createFrontendModule({
  pluginId: 'api-docs',
  extensions: [
    ApiBlueprint.make({
      params: defineParams =>
        defineParams({
          api: apiDocsConfigRef,
          deps: {},
          factory: () => ({
            getApiDefinitionWidget: (
              apiEntity: ApiEntity,
            ): ApiDefinitionWidget | undefined => {
              if (apiEntity.spec.type === DATA_CONTRACT_TYPE) {
                return {
                  type: DATA_CONTRACT_TYPE,
                  title: 'Data Contract',
                  rawLanguage: 'yaml',
                  component: (definition: string) => (
                    <DataContractViewer definition={definition} />
                  ),
                };
              }
              return defaultDefinitionWidgets().find(
                widget => widget.type === apiEntity.spec.type,
              );
            },
          }),
        }),
    }),
  ],
});
