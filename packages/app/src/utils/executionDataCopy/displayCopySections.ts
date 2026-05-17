import { isRecord } from '../dataValuePayloads.js';

export type DisplayCopySection = {
  label: string;
  value: unknown;
};

const DISPLAY_COPY_SECTIONS = Symbol('display-copy-sections');

type DisplayCopySections = {
  [DISPLAY_COPY_SECTIONS]: true;
  sections: DisplayCopySection[];
};

export function displayCopySections(sections: DisplayCopySection[]): unknown {
  return {
    [DISPLAY_COPY_SECTIONS]: true,
    sections,
  };
}

export function isDisplayCopySections(value: unknown): value is DisplayCopySections {
  const candidate = value as DisplayCopySections | undefined;
  return (
    candidate?.[DISPLAY_COPY_SECTIONS] === true &&
    Array.isArray(candidate.sections) &&
    candidate.sections.every((section) => isRecord(section) && typeof section.label === 'string')
  );
}
