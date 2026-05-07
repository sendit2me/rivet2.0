import { strict as assert } from 'node:assert';
import test from 'node:test';
import {
  isProjectScopedMenuCommand,
  isProjectWorkspaceSelected,
  shouldRunMenuCommandForProjectSelection,
} from './projectWorkspaceSelection.js';
import { MENU_COMMAND_IDS, type MenuIds } from './menuCommandIds.js';

test('project workspace is selected only when canvas is active and a project is open', () => {
  assert.equal(isProjectWorkspaceSelected({ openOverlay: undefined, openProjectCount: 1 }), true);
  assert.equal(isProjectWorkspaceSelected({ openOverlay: 'dataStudio', openProjectCount: 1 }), false);
  assert.equal(isProjectWorkspaceSelected({ openOverlay: undefined, openProjectCount: 0 }), false);
});

test('project scoped commands require a selected project workspace', () => {
  const projectScopedCommands: MenuIds[] = [
    'save_project',
    'save_project_as',
    'export_graph',
    'import_graph',
    'run',
    'load_recording',
    'remote_debugger',
    'clear_outputs',
  ];
  const globalCommands: MenuIds[] = MENU_COMMAND_IDS.filter((command) => !projectScopedCommands.includes(command));

  for (const command of projectScopedCommands) {
    assert.equal(isProjectScopedMenuCommand(command), true, command);
    assert.equal(shouldRunMenuCommandForProjectSelection({ command, projectWorkspaceSelected: false }), false, command);
    assert.equal(shouldRunMenuCommandForProjectSelection({ command, projectWorkspaceSelected: true }), true, command);
  }

  for (const command of globalCommands) {
    assert.equal(isProjectScopedMenuCommand(command), false, command);
    assert.equal(shouldRunMenuCommandForProjectSelection({ command, projectWorkspaceSelected: false }), true, command);
  }
});
