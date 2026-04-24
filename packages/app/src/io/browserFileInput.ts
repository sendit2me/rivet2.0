export function openBrowserFile(options?: { accept?: string }): Promise<File | undefined> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.style.display = 'none';

    if (options?.accept) {
      input.accept = options.accept;
    }

    let settled = false;
    const resolveOnce = (file: File | undefined) => {
      if (settled) return;

      settled = true;
      input.onchange = null;
      input.oncancel = null;
      input.remove();
      resolve(file);
    };

    input.onchange = () => {
      resolveOnce(input.files?.[0]);
    };

    input.oncancel = () => {
      resolveOnce(undefined);
    };

    document.body.appendChild(input);
    input.click();
  });
}
