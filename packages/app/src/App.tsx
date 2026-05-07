import 'core-js/actual';
import { QueryClient } from '@tanstack/react-query';
import { RivetAppHost } from './host';

const queryClient = new QueryClient();

function App() {
  return <RivetAppHost queryClient={queryClient} />;
}

export default App;
