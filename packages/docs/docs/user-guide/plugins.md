# Plugins

Plugins add node types and plugin-specific settings to Rivet.

## App-Installed Plugins

In Rivet 2.0, installing a plugin means installing it into the Rivet app. Once installed, the plugin's nodes appear in the node picker for every project you open.

Open Settings > Plugins to search the plugin catalog, install catalog plugins, add npm package plugins manually, and remove plugins from the app.

The Installed state in the plugin catalog means "installed in this Rivet app." It does not mean the current project declares the plugin.

## Project Plugin Declarations

Rivet project files still use the existing `plugins` YAML field. Users do not edit that field directly.

Instead, Rivet derives the project's plugin list from graph contents:

- If a graph contains a node from an app-installed plugin, the project declares that plugin when it is saved, run, or uploaded to a remote executor.
- Duplicate plugin nodes still produce one plugin declaration.
- Removing all nodes from a plugin removes that plugin from the project's saved plugin list.
- Built-in nodes do not add plugin declarations.

This means a plugin can be installed into the app and available in the node picker without every project declaring it.

## Removing Plugins

Use Settings > Plugins to remove a plugin from the Rivet app. Removing an app-installed plugin unregisters its node types from the editor.

Removing an app-installed plugin does not directly edit any project file. If a project still contains nodes from that plugin, those nodes remain in the project and may render as unknown node types until the plugin is installed again.

To remove a plugin from a project cleanly, remove all corresponding plugin nodes from the project's graphs and save the project.

## Missing Plugins

When you open a project whose YAML declares plugins that are not installed in the app, Rivet shows a missing-plugin modal. Each missing plugin has an Install button.

Closing the modal leaves the project unchanged. Rivet does not auto-install plugins from project YAML; the user chooses which missing plugins to install.

## Plugin Settings

Plugin-specific configuration lives in Settings > Plugins settings. This page is separate from the plugin catalog so installing/removing plugins and editing plugin API keys remain distinct tasks.

## Installing NPM Plugins

If the plugin you want is not in the catalog, use the NPM plugin row in Settings > Plugins. Enter the package name and optionally a version.

Package plugins are installed into Rivet's app-data plugin store using the bundled package-manager sidecar, so users do not need a globally installed package manager.

## Installing Plugins From Source

You can install a plugin from local source by placing it in Rivet's plugin install directory:

1. Open Settings > Plugins.
2. Copy the plugin install directory shown below the plugin list.
3. Create a directory named `<package-name>-latest` inside that plugin install directory.
4. Clone or copy the plugin package into a `package` subdirectory.
5. Build the plugin package if it does not commit its bundled output.
6. Use the NPM plugin row in Rivet and enter `<package-name>`.

The package name must match the plugin package's `package.json` `name` field.
