import * as React from 'react';
import { Section } from './Section';

import styles from './WhatIsRivetSection.module.css';

export const WhatIsRivetSection: React.FC<{ id?: string }> = ({ id }) => {
  return (
    <Section id={id}>
      <h2>What is Rivet?</h2>
      <div className={styles.text}>
        <p>
          Rivet is a visual programming environment for building AI agents with LLMs. Iterate on your prompt graphs in
          Rivet, then run them directly in your application. With Rivet, teams can effectively design, debug, and
          collaborate on complex LLM prompt graphs, and deploy them in their own environment.
        </p>
        <p>
          Rivet's visual environment, debugger, and executor model make complex AI workflows easier to design, inspect,
          and embed than a code-only prompt-chain setup. Rivet 2.0 keeps that graph-first workflow while tightening the
          runtime, app, plugin, and wrapper integration seams.
        </p>
      </div>
    </Section>
  );
};
