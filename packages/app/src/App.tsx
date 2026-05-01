import 'core-js/actual';
import '@atlaskit/css-reset';
import { QueryClient } from '@tanstack/react-query';
import { RivetAppHost } from './host';

const queryClient = new QueryClient();

function App() {
  return <RivetAppHost queryClient={queryClient} />;
}

export default App;
