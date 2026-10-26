// Checks that the Judge0 settings in server/.env work, by running tiny Python, Java and C programs.
// Usage:  cd server  &&  npm run check:judge
import 'dotenv/config';
import { createJudge } from '../src/judge.js';

const url = process.env.JUDGE0_URL?.trim();
if (!url) {
  console.log('✖ JUDGE0_URL is empty in server/.env, so the platform is in MANUAL mode (nothing to check).');
  process.exit(1);
}
const num = (v) => (v && Number(v) ? Number(v) : undefined);
const langIds = Object.fromEntries(
  [['python', num(process.env.JUDGE0_LANG_PYTHON)], ['java', num(process.env.JUDGE0_LANG_JAVA)], ['c', num(process.env.JUDGE0_LANG_C)]].filter(([, v]) => v),
);
const judge = createJudge({
  url,
  authToken: process.env.JUDGE0_AUTH_TOKEN?.trim() || '',
  rapidApiKey: process.env.JUDGE0_RAPIDAPI_KEY?.trim() || '',
  langIds,
});

const tests = [
  { input: '2\n3 4\n', expected: '7' },
  { input: '1\n-5\n', expected: '-5' },
];
const programs = {
  python: {
    good: 'n = int(input())\nprint(sum(map(int, input().split())))',
    bad: 'print(0)',
    broken: 'print(',
  },
  java: {
    good: 'import java.util.*;\npublic class Main { public static void main(String[] a){ Scanner s=new Scanner(System.in); int n=s.nextInt(); int t=0; for(int i=0;i<n;i++) t+=s.nextInt(); System.out.println(t);} }',
    bad: 'public class Main { public static void main(String[] a){ System.out.println(0);} }',
    broken: 'public class Main { oops',
  },
  c: {
    good: '#include <stdio.h>\nint main(){int n,x,t=0;scanf("%d",&n);for(int i=0;i<n;i++){scanf("%d",&x);t+=x;}printf("%d\\n",t);return 0;}',
    bad: '#include <stdio.h>\nint main(){printf("0\\n");return 0;}',
    broken: 'int main( {',
  },
};

let failed = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '✔' : '✖'} ${label}${detail ? ` – ${detail}` : ''}`);
  if (!ok) failed++;
};

console.log(`Judge0 at ${url}\n`);
for (const [language, p] of Object.entries(programs)) {
  const good = await judge.judge({ language, code: p.good, tests });
  check(`${language}: correct program passes all tests`, good.status === 'ok', `${good.status} ${good.message ?? ''}`);
  const bad = await judge.judge({ language, code: p.bad, tests });
  check(`${language}: wrong program is marked wrong`, bad.status === 'wrong_answer' && bad.passed < bad.total, bad.status);
  const broken = await judge.judge({ language, code: p.broken, tests });
  check(`${language}: broken program gives a compile/runtime error`, ['compile_error', 'runtime_error'].includes(broken.status), broken.status);
  const run = await judge.run({ language, code: p.good, inputs: [tests[0].input] });
  check(`${language}: Run code prints the output`, run.status === 'ok' && run.runs?.[0]?.stdout.trim() === '7', run.status);
}
console.log(failed ? `\n✖ ${failed} check(s) failed. See JUDGE0_SETUP.md → Troubleshooting.` : '\n✔ Judge0 is working. Round 3 can be judged automatically.');
process.exit(failed ? 1 : 0);
