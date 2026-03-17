import { toast } from 'react-toastify';
import { handleError } from './errorHandling.js';

export const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    console.log('Text copied to clipboard');

    toast.success('Text copied to clipboard');
  } catch (err) {
    handleError(err, 'Failed to copy text to clipboard', {
      metadata: {
        textLength: text.length,
      },
    });
  }
};
