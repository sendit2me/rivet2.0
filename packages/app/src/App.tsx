import 'core-js/actual';
import '@atlaskit/css-reset';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RivetAppLoader } from './components/RivetAppLoader';
import { ExecutorSessionProvider } from './providers/ExecutorSessionContext';
import { ProvidersProvider } from './providers/ProvidersContext';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ProvidersProvider>
        <ExecutorSessionProvider>
          <RivetAppLoader />
        </ExecutorSessionProvider>
      </ProvidersProvider>
    </QueryClientProvider>
  );
}

export default App;
