import * as React from 'react';
import { Section } from './Section';

import styles from './HeroSection.module.css';
import { Platform, useDownloadUrl } from '../../hooks/useDownloadUrl';
import WindowsWordmark from './logos/windows-wordmark.svg';
import MacOSWordmark from './logos/macos-wordmark.svg';

export const HeroSection: React.FC<{ id?: string }> = ({ id }) => {
  const { downloadUrl, platform } = useDownloadUrl();
  return (
    <Section className={styles.container} id={id}>
      <h1 className={styles.title}>Rivet 2.0 Visual AI Programming</h1>
      <a className={styles.downloadButton} href={downloadUrl} target="_blank">
        Download
        {platform !== 'unknown' && platform !== 'server' && (
          <>
            {' '}
            for <PlatformWordmark platform={platform} />
          </>
        )}
      </a>
      <a className={styles.latestRelease} href="https://github.com/valerypopoff/rivet2.0/releases/latest">
        Latest Release
      </a>
      <div className={styles.imgContainer}>
        <img className={styles.img} height="300px" src="img/graph.png" alt="Rivet Graph" />
      </div>
      <div className={styles.scrollIcon}>&#8744;</div>
    </Section>
  );
};

const PlatformWordmark: React.FC<{ platform: Platform }> = ({ platform }) => {
  switch (platform) {
    case 'mac':
      return <MacOSWordmark className={styles.wordmark} />;
    case 'windows':
      return <WindowsWordmark className={styles.wordmark} />;
    case 'linux':
      return <span className={styles.wordmark}>Linux&#174;</span>;
    case 'unknown':
    case 'server':
      return null;
  }
};
