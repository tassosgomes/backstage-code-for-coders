import { createApp } from '@backstage/frontend-defaults';
import catalogPlugin from '@backstage/plugin-catalog/alpha';
import apiDocsPlugin from '@backstage/plugin-api-docs/alpha';
import { navModule } from './modules/nav';
import { homeModule } from './modules/home';
import { contractsModule } from './modules/contracts';

export default createApp({
  features: [
    catalogPlugin,
    apiDocsPlugin,
    contractsModule,
    navModule,
    homeModule,
  ],
});
