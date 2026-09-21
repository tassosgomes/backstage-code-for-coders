import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import { catalogProcessingExtensionPoint } from '@backstage/plugin-catalog-node';
import { ContractsEntityProvider } from './provider';

/**
 * Catalog module that ingests API/data contracts (OpenAPI, AsyncAPI, ODCS)
 * from a configured source (GitHub repo or local folder) as API entities.
 */
export const catalogModuleContracts = createBackendModule({
  pluginId: 'catalog',
  moduleId: 'contracts',
  register({ registerInit }) {
    registerInit({
      deps: {
        logger: coreServices.logger,
        rootConfig: coreServices.rootConfig,
        scheduler: coreServices.scheduler,
        catalog: catalogProcessingExtensionPoint,
      },
      async init({ logger, rootConfig, scheduler, catalog }) {
        const provider = ContractsEntityProvider.fromConfig(rootConfig, {
          logger,
          scheduler,
        });
        if (provider) {
          catalog.addEntityProvider(provider);
        }
      },
    });
  },
});
