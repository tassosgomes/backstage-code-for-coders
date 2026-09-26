import { createFrontendModule } from '@backstage/frontend-plugin-api';
import { UnifiedThemeProvider, createUnifiedTheme, palettes } from '@backstage/theme';
import Brightness2Icon from '@material-ui/icons/Brightness2';
import WbSunnyIcon from '@material-ui/icons/WbSunny';
import { ThemeBlueprint } from '@backstage/plugin-app-react';

const brandPurple = '#7c3aed';
const brandGreen = '#34d399';
const darkForeground = '#0d0b14';

const lightTheme = createUnifiedTheme({
  palette: {
    ...palettes.light,
    primary: { main: brandPurple },
    secondary: { main: brandGreen, contrastText: darkForeground },
    link: brandPurple,
    linkHover: '#6d28d9',
    navigation: {
      ...palettes.light.navigation,
      indicator: brandPurple,
    },
    tabbar: { indicator: brandGreen },
  },
});

const darkTheme = createUnifiedTheme({
  palette: {
    ...palettes.dark,
    primary: { main: brandPurple },
    secondary: { main: brandGreen, contrastText: darkForeground },
    link: '#a78bfa',
    linkHover: '#c4b5fd',
    navigation: {
      ...palettes.dark.navigation,
      indicator: brandPurple,
    },
    tabbar: { indicator: brandGreen },
  },
});

export const themeModule = createFrontendModule({
  pluginId: 'app',
  extensions: [
    ThemeBlueprint.make({
      name: 'code4coders-light',
      params: {
        theme: {
          id: 'light',
          title: 'Code for Coders Light',
          variant: 'light',
          icon: <WbSunnyIcon />,
          Provider: ({ children }) => (
            <UnifiedThemeProvider theme={lightTheme}>
              {children}
            </UnifiedThemeProvider>
          ),
        },
      },
    }),
    ThemeBlueprint.make({
      name: 'code4coders-dark',
      params: {
        theme: {
          id: 'dark',
          title: 'Code for Coders Dark',
          variant: 'dark',
          icon: <Brightness2Icon />,
          Provider: ({ children }) => (
            <UnifiedThemeProvider theme={darkTheme}>
              {children}
            </UnifiedThemeProvider>
          ),
        },
      },
    }),
  ],
});
