// Sample content used to seed a new database (pure data, no database access).
/* ------------------------------------------------------------------ sample content */

const Q = (text, options, correct) => ({ text, options, correct });

const sampleQuiz = () => [
  Q('Which data structure follows the LIFO (last in, first out) order?', ['Queue', 'Stack', 'Array', 'Linked list'], 1),
  Q('What is the time complexity of binary search on a sorted array?', ['O(n)', 'O(log n)', 'O(n log n)', 'O(1)'], 1),
  Q('Which keyword is used to inherit a class in Java?', ['implements', 'extends', 'inherits', 'super'], 1),
  Q('What does printf("%d", 5 / 2); print in C?', ['2.5', '2', '3', 'Compilation error'], 1),
  Q('Which protocol is used to load web pages securely?', ['FTP', 'HTTP', 'HTTPS', 'SMTP'], 2),
  Q('What does len([1, 2, 3]) return in Python?', ['2', '3', '4', 'Error'], 1),
];

const V = (language, wrongCode, correctCode) => ({ language, wrongCode, correctCode });

const sampleFixes = () => [
  {
    title: 'Sum of two numbers',
    description: 'The program should read two integers and print their SUM, but it prints the wrong result. Fix the code.',
    variants: [
      V(
        'python',
        'a = int(input())\nb = int(input())\nprint(a - b)\n',
        'a = int(input())\nb = int(input())\nprint(a + b)\n',
      ),
      V(
        'java',
        'import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        int a = sc.nextInt();\n        int b = sc.nextInt();\n        System.out.println(a - b);\n    }\n}\n',
        'import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        int a = sc.nextInt();\n        int b = sc.nextInt();\n        System.out.println(a + b);\n    }\n}\n',
      ),
      V(
        'c',
        '#include <stdio.h>\n\nint main() {\n    int a, b;\n    scanf("%d %d", &a, &b);\n    printf("%d\\n", a - b);\n    return 0;\n}\n',
        '#include <stdio.h>\n\nint main() {\n    int a, b;\n    scanf("%d %d", &a, &b);\n    printf("%d\\n", a + b);\n    return 0;\n}\n',
      ),
    ],
  },
  {
    title: 'Factorial of a number',
    description: 'The program should print n! (for example 5! = 120) but always prints 0. Fix the code.',
    variants: [
      V(
        'python',
        'n = int(input())\nf = 1\nfor i in range(0, n + 1):\n    f *= i\nprint(f)\n',
        'n = int(input())\nf = 1\nfor i in range(1, n + 1):\n    f *= i\nprint(f)\n',
      ),
      V(
        'java',
        'import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        int n = sc.nextInt();\n        long f = 1;\n        for (int i = 0; i <= n; i++) {\n            f *= i;\n        }\n        System.out.println(f);\n    }\n}\n',
        'import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        int n = sc.nextInt();\n        long f = 1;\n        for (int i = 1; i <= n; i++) {\n            f *= i;\n        }\n        System.out.println(f);\n    }\n}\n',
      ),
      V(
        'c',
        '#include <stdio.h>\n\nint main() {\n    int n;\n    long long f = 1;\n    scanf("%d", &n);\n    for (int i = 0; i <= n; i++) {\n        f *= i;\n    }\n    printf("%lld\\n", f);\n    return 0;\n}\n',
        '#include <stdio.h>\n\nint main() {\n    int n;\n    long long f = 1;\n    scanf("%d", &n);\n    for (int i = 1; i <= n; i++) {\n        f *= i;\n    }\n    printf("%lld\\n", f);\n    return 0;\n}\n',
      ),
    ],
  },
  {
    title: 'Even or odd',
    description: 'The program should print "Even" for even numbers and "Odd" for odd numbers, but the answers are swapped. Fix the code.',
    variants: [
      V(
        'python',
        'n = int(input())\nif n % 2 == 1:\n    print("Even")\nelse:\n    print("Odd")\n',
        'n = int(input())\nif n % 2 == 0:\n    print("Even")\nelse:\n    print("Odd")\n',
      ),
      V(
        'java',
        'import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        int n = sc.nextInt();\n        if (n % 2 == 1) {\n            System.out.println("Even");\n        } else {\n            System.out.println("Odd");\n        }\n    }\n}\n',
        'import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        int n = sc.nextInt();\n        if (n % 2 == 0) {\n            System.out.println("Even");\n        } else {\n            System.out.println("Odd");\n        }\n    }\n}\n',
      ),
      V(
        'c',
        '#include <stdio.h>\n\nint main() {\n    int n;\n    scanf("%d", &n);\n    if (n % 2 == 1) {\n        printf("Even\\n");\n    } else {\n        printf("Odd\\n");\n    }\n    return 0;\n}\n',
        '#include <stdio.h>\n\nint main() {\n    int n;\n    scanf("%d", &n);\n    if (n % 2 == 0) {\n        printf("Even\\n");\n    } else {\n        printf("Odd\\n");\n    }\n    return 0;\n}\n',
      ),
    ],
  },
];

const T = (input, expected, sample = false) => ({ input, expected, sample });

const sampleProblems = () => [
  {
    title: 'Sum of N numbers',
    statement:
      'The first line contains N. The second line contains N integers. Print their sum.\n\nExample: input "5" then "1 2 3 4 5" -> output 15.',
    points: 20,
    tests: [
      T('5\n1 2 3 4 5\n', '15', true),
      T('3\n10 20 30\n', '60', true),
      T('1\n-7\n', '-7'),
      T('4\n0 0 0 0\n', '0'),
    ],
  },
  {
    title: 'Reverse a string',
    statement: 'Read a single word/line and print it reversed.\n\nExample: "codesmash" -> "hsamsedoc".',
    points: 20,
    tests: [
      T('codesmash\n', 'hsamsedoc', true),
      T('a\n', 'a'),
      T('racecar\n', 'racecar'),
      T('Hello World\n', 'dlroW olleH'),
    ],
  },
  {
    title: 'Count the vowels',
    statement: 'Read a line of text and print how many vowels (a, e, i, o, u – any case) it contains.',
    points: 20,
    tests: [
      T('Chhatrapati Sambhajinagar\n', '9', true),
      T('xyz\n', '0'),
      T('AEIOU aeiou\n', '10'),
    ],
  },
];

/** Fresh default rounds. Passwords are empty: the organiser sets one per round before opening it. */
export const defaultRounds = () => [
  {
    n: 1,
    type: 'quiz',
    name: 'Round 1 – Technical Quiz',
    durationMin: 30,
    qualifyScore: 3,
    questionCount: 30,
    marksPerQuestion: 1,
    password: '',
    status: 'upcoming',
    quiz: sampleQuiz(),
    fixes: [],
    problems: [],
  },
  {
    n: 2,
    type: 'codefix',
    name: 'Round 2 – Code Correction',
    durationMin: 45,
    qualifyScore: 20,
    questionCount: 3,
    marksPerQuestion: 10,
    password: '',
    status: 'upcoming',
    quiz: [],
    fixes: sampleFixes(),
    problems: [],
  },
  {
    n: 3,
    type: 'coding',
    name: 'Round 3 – Problem Solving',
    durationMin: 30,
    qualifyScore: 40,
    questionCount: 0,
    marksPerQuestion: 0,
    password: '',
    status: 'upcoming',
    quiz: [],
    fixes: [],
    problems: sampleProblems(),
  },
];
