import * as React from 'react';
import { Header } from '../components/main/Header';
import { HeroSection } from '../components/main/HeroSection';
import { WhatIsRivetSection } from '../components/main/WhatIsRivetSection';
import { FeaturesSection } from '../components/main/FeaturesSection';
import { DemoVideoSection } from '../components/main/DemoVideoSection';
import { UseCasesSection } from '../components/main/UseCasesSection';
import { GetStartedSection } from '../components/main/GetStartedSection';
import { Footer } from '../components/main/Footer';

import styles from './styles.module.css';
import Head from '@docusaurus/Head';

export default function Home() {
  return (
    <main className={styles.main}>
      <Head>
        <meta property="og:title" content="Rivet 2.0" />
        <meta
          property="og:description"
          content="A visual AI programming environment and runtime package set for graph-based AI workflows"
        />
        <meta property="og:image" content="https://valerypopoff.github.io/img/social-card.png" />
        <meta name="twitter:title" content="Rivet 2.0" />
        <meta
          name="twitter:description"
          content="A visual AI programming environment and runtime package set for graph-based AI workflows"
        />
        <meta name="twitter:image" content="https://valerypopoff.github.io/img/social-card.png" />
        <meta name="twitter:card" content="summary_large_image" />
      </Head>
      <Header />

      <HeroSection id="hero" />
      <WhatIsRivetSection id="what-is-rivet" />
      <FeaturesSection id="features" />
      <DemoVideoSection id="demo-video" />
      <UseCasesSection id="use-cases" />
      <GetStartedSection id="get-started" />

      <Footer />

      {/** Background */}
      <div className={styles.lines} />
    </main>
  );
}
