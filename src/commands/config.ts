import { Command } from 'commander';
import { getGlobalConfig, saveGlobalConfig, getConfigForCLI } from '@utils/config';

export function createConfigCommand(): Command {
  const configCmd = new Command('config')
    .description('Manage OpenFlow configuration');

  configCmd
    .addCommand(
      new Command('set')
      .description('Set a configuration value')
      .argument('<key>', 'Configuration key')
      .argument('<value>', 'Configuration value')
      .action((key: string, value: string) => {
        const config = getGlobalConfig();
        (config as any)[key] = value;
        saveGlobalConfig(config);
        console.log(`Set ${key} = ${value}`);
      })
    )
    .addCommand(
      new Command('get')
      .description('Get a configuration value')
      .argument('<key>', 'Configuration key')
      .action((key: string) => {
        const value = getConfigForCLI(key);
        if (value !== undefined) {
          console.log(`${key} = ${value}`);
        } else {
          console.log(`${key} is not set`);
        }
      })
    )
    .addCommand(
      new Command('list')
      .description('List all configuration values')
      .action(() => {
        const config = getGlobalConfig();
        Object.entries(config).forEach(([key, value]) => {
          console.log(`${key} = ${value}`);
        });
      })
    )
    .addCommand(
      new Command('unset')
      .description('Remove a configuration value')
      .argument('<key>', 'Configuration key')
      .action((key: string) => {
        const config = getGlobalConfig();
        delete (config as any)[key];
        saveGlobalConfig(config);
        console.log(`Unset ${key}`);
      })
    );

  // Add UI helper properties
  (configCmd as any).userFacingName = () => 'config';
  (configCmd as any).isHidden = false;

  return configCmd;
}