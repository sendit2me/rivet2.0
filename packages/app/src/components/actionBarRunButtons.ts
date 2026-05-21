export const PROJECT_RUN_BUTTON_LABEL = 'Run project';

export type ActionBarRunButtonPresentationOptions = {
  currentGraphName?: string;
  graphRunning: boolean;
  hasLoadedRecording: boolean;
  hasMainGraph: boolean;
  isMainGraph: boolean;
  showRunButton: boolean;
};

export type ActionBarRunButtonPresentation = {
  currentGraphRunLabel: string;
  currentGraphRunSecondary: boolean;
  projectGraphRunLabel: typeof PROJECT_RUN_BUTTON_LABEL;
  showProjectGraphRunButton: boolean;
};

export function getActionBarRunButtonPresentation(
  options: ActionBarRunButtonPresentationOptions,
): ActionBarRunButtonPresentation {
  const showProjectGraphRunButton =
    options.showRunButton &&
    options.hasMainGraph &&
    !options.isMainGraph &&
    !options.graphRunning &&
    !options.hasLoadedRecording;

  const currentGraphRunLabel = getCurrentGraphRunLabel(options);

  return {
    currentGraphRunLabel,
    currentGraphRunSecondary: showProjectGraphRunButton,
    projectGraphRunLabel: PROJECT_RUN_BUTTON_LABEL,
    showProjectGraphRunButton,
  };
}

function getCurrentGraphRunLabel(options: ActionBarRunButtonPresentationOptions) {
  if (!options.hasMainGraph) {
    return 'Run';
  }

  if (options.isMainGraph) {
    return PROJECT_RUN_BUTTON_LABEL;
  }

  return options.currentGraphName ? `Run ${options.currentGraphName}` : 'Run graph';
}
