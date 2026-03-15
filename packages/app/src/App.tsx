import 'core-js/actual';
import '@atlaskit/css-reset';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RivetAppLoader } from './components/RivetAppLoader';
import { ProvidersProvider } from './providers/ProvidersContext';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ProvidersProvider>
        <RivetAppLoader />
      </ProvidersProvider>
    </QueryClientProvider>
  );
}

export default App;
