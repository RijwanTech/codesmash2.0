// Runs Python code INSIDE THE STUDENT'S BROWSER with Pyodide (Python compiled to WebAssembly).
// The code runs in a Web Worker in the browser sandbox, never on the server, so it is safe and needs no Judge0.
// Needs internet access on the student's device to download Pyodide (about 10 MB, cached afterwards).
const PYODIDE = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';

const WORKER_SRC = `
importScripts('${PYODIDE}pyodide.js');
let py;
onmessage = async (e) => {
  const { code, input } = e.data;
  try {
    py = py || await loadPyodide({ indexURL: '${PYODIDE}' });
    let out = '', err = '';
    py.setStdout({ batched: (s) => { out += s + '\\n'; } });
    py.setStderr({ batched: (s) => { err += s + '\\n'; } });
    const lines = input.replace(/\\r\\n?/g, '\\n').replace(/\\n$/, '').split('\\n');
    let i = 0;
    py.setStdin({ stdin: () => (i < lines.length ? lines[i++] : undefined) });
    await py.runPythonAsync(code, { globals: py.toPy({ __name__: '__main__' }) });
    postMessage({ out, err });
  } catch (ex) {
    postMessage({ out: '', err: String((ex && ex.message) || ex) });
  }
};
`;

export interface PyRun {
  output: string;
  error: string;
}

export function runPython(code: string, input: string, timeoutMs = 15000): Promise<PyRun> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }));
    const worker = new Worker(url);
    const done = (r: PyRun) => {
      clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(url);
      resolve(r);
    };
    const timer = setTimeout(
      () => done({ output: '', error: 'Time limit exceeded (or Python could not be downloaded – check your internet connection).' }),
      timeoutMs,
    );
    worker.onmessage = (e: MessageEvent<{ out: string; err: string }>) => {
      // Keep only the last lines of a Python traceback; the first lines are internal.
      done({ output: e.data.out, error: e.data.err.trim().split('\n').slice(-4).join('\n') });
    };
    worker.onerror = () => done({ output: '', error: 'Could not start the Python runner in this browser.' });
    worker.postMessage({ code, input });
  });
}
