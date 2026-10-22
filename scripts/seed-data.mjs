// Demo data for PlaceMatch. Companies and people are fictional.

export const departments = [
  ['CS', 'Computer Science and Engineering'],
  ['AIML', 'CSE (AI & Machine Learning)'],
  ['EC', 'Electronics and Communication'],
  ['EE', 'Electrical and Electronics'],
  ['ME', 'Mechanical Engineering'],
];

export const skills = [
  'Python', 'Java', 'C++', 'C', 'JavaScript', 'TypeScript', 'React', 'Next.js', 'Node.js',
  'SQL', 'PostgreSQL', 'MongoDB', 'Docker', 'Kubernetes', 'AWS', 'Linux', 'Git',
  'Machine Learning', 'Deep Learning', 'PyTorch', 'NLP', 'Data Analysis', 'Pandas', 'Power BI',
  'Embedded C', 'Verilog', 'VLSI', 'MATLAB', 'IoT', 'AutoCAD', 'SolidWorks', 'ANSYS',
  'System Design', 'DSA', 'Spring Boot', 'Go', 'Android', 'Figma', 'Excel', 'Communication',
];

// Resume archetypes: each student is generated from one of these
export const profiles = {
  backend: {
    depts: ['CS', 'AIML'],
    skills: ['Java', 'Spring Boot', 'SQL', 'PostgreSQL', 'Docker', 'System Design', 'DSA', 'Git'],
    text: `Backend developer comfortable designing REST APIs and microservices. Built a ride-sharing backend in Spring Boot with PostgreSQL, Redis caching and Docker deployment; wrote integration tests and tuned slow SQL queries with indexes. Strong in data structures, algorithms and object-oriented design. Interned at a fintech startup building payment reconciliation services.`,
  },
  fullstack: {
    depts: ['CS', 'AIML', 'EC'],
    skills: ['JavaScript', 'TypeScript', 'React', 'Next.js', 'Node.js', 'MongoDB', 'Git', 'Figma'],
    text: `Full-stack web developer building responsive products with React, Next.js and Node.js. Shipped a campus event-booking platform used by 2,000 students with authentication, payments and an admin dashboard. Experience with MongoDB, REST and GraphQL APIs, CI pipelines and UI design in Figma. Cares about accessibility and page performance.`,
  },
  ml: {
    depts: ['AIML', 'CS'],
    skills: ['Python', 'Machine Learning', 'Deep Learning', 'PyTorch', 'NLP', 'Pandas', 'SQL'],
    text: `Machine learning enthusiast working on NLP and computer vision. Fine-tuned transformer models for sentiment classification and built a retrieval-augmented question answering bot over course notes using sentence embeddings and a vector database. Comfortable with PyTorch, scikit-learn, experiment tracking and deploying models behind a FastAPI service. Published a paper at a student research symposium.`,
  },
  data: {
    depts: ['CS', 'AIML', 'EE', 'ME'],
    skills: ['Python', 'SQL', 'Data Analysis', 'Pandas', 'Power BI', 'Excel', 'Communication'],
    text: `Data analyst who turns messy business data into dashboards and decisions. Built Power BI reports for a retail chain's sales data, wrote complex SQL with window functions, and automated weekly reporting in Python with pandas. Strong statistics foundation, A/B test analysis and clear communication with non-technical stakeholders.`,
  },
  devops: {
    depts: ['CS', 'EC'],
    skills: ['Linux', 'Docker', 'Kubernetes', 'AWS', 'Go', 'Git', 'Python'],
    text: `Cloud and DevOps engineer. Set up Kubernetes clusters on AWS, wrote Terraform for infrastructure as code and GitHub Actions pipelines for zero-downtime deployments. Built a log monitoring tool in Go with Prometheus and Grafana alerts. Comfortable with Linux internals, networking and shell scripting.`,
  },
  embedded: {
    depts: ['EC', 'EE'],
    skills: ['Embedded C', 'C', 'IoT', 'MATLAB', 'Linux', 'C++'],
    text: `Embedded systems engineer working with ARM Cortex-M microcontrollers and RTOS. Designed an IoT soil-moisture monitoring node with LoRa communication and low-power sleep modes. Wrote device drivers for I2C and SPI sensors in embedded C, debugged with oscilloscopes and logic analysers, and simulated control loops in MATLAB.`,
  },
  vlsi: {
    depts: ['EC', 'EE'],
    skills: ['Verilog', 'VLSI', 'C', 'MATLAB'],
    text: `VLSI design student focused on digital design and verification. Implemented a pipelined RISC-V processor in Verilog, verified it with SystemVerilog testbenches and synthesised it on an FPGA. Familiar with static timing analysis, low-power design techniques and the ASIC design flow.`,
  },
  mech: {
    depts: ['ME'],
    skills: ['AutoCAD', 'SolidWorks', 'ANSYS', 'MATLAB', 'Excel'],
    text: `Mechanical design engineer skilled in CAD modelling and simulation. Designed and analysed a lightweight chassis for the college Formula Student team in SolidWorks and ANSYS, reducing weight by 12 percent. Experience with GD&T, manufacturing drawings, thermal analysis and lean manufacturing during a plant internship.`,
  },
  android: {
    depts: ['CS', 'AIML'],
    skills: ['Java', 'Android', 'Git', 'SQL', 'Figma'],
    text: `Android developer who has published two apps on the Play Store with 10k+ downloads. Builds apps in Java and Kotlin with MVVM architecture, Room database, offline sync and Firebase notifications. Designs clean mobile UIs in Figma and writes unit tests with JUnit.`,
  },
};

const firstNames = ['Aarav', 'Diya', 'Rohan', 'Ananya', 'Kiran', 'Meera', 'Arjun', 'Sneha', 'Varun', 'Ishita',
  'Rahul', 'Pooja', 'Nikhil', 'Kavya', 'Siddharth', 'Riya', 'Aditya', 'Nandini', 'Harsha', 'Tanvi',
  'Karthik', 'Shruti', 'Manish', 'Bhavana', 'Akash', 'Divya', 'Pranav', 'Lakshmi', 'Gautam', 'Neha',
  'Suhas', 'Aishwarya', 'Vikram', 'Deepika', 'Yash', 'Sanjana', 'Abhishek', 'Keerthi', 'Tejas', 'Pallavi'];
const lastNames = ['Rao', 'Sharma', 'Iyer', 'Reddy', 'Nair', 'Kulkarni', 'Hegde', 'Menon', 'Gowda', 'Joshi',
  'Bhat', 'Patil', 'Shetty', 'Verma', 'Kamath', 'Pai', 'Naik', 'Murthy', 'Desai', 'Prasad'];

// Deterministic pseudo-random generator so every seed run gives the same data
function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

export function buildStudents(count = 40) {
  const rand = rng(42);
  const keys = Object.keys(profiles);
  const students = [];
  for (let i = 0; i < count; i++) {
    const profileKey = keys[i % keys.length];
    const p = profiles[profileKey];
    const dept = p.depts[Math.floor(rand() * p.depts.length)];
    const first = firstNames[i % firstNames.length];
    const last = lastNames[Math.floor(rand() * lastNames.length)];
    const batch = i < 34 ? 2027 : 2028;
    const cgpa = Math.round((6.2 + rand() * 3.6) * 100) / 100;
    const backlogs = rand() < 0.12 ? 1 + Math.floor(rand() * 2) : 0;
    const srnCode = dept === 'AIML' ? 'AM' : dept === 'CS' ? 'CS' : dept;
    const srn = `PES1UG${String(batch - 4).slice(2)}${srnCode}${String(100 + i * 7).padStart(3, '0')}`;
    students.push({
      name: `${first} ${last}`,
      email: `${first}.${last}${i}@placematch.test`.toLowerCase(),
      srn,
      dept,
      batch,
      cgpa,
      backlogs,
      phone: `9${String(800000000 + i * 1234567).slice(0, 9)}`,
      profile: profileKey,
      skills: p.skills,
      resume: `${first} ${last} - ${dept} student. ${p.text}`,
    });
  }
  return students;
}

export const companies = [
  { name: 'Nimbus Analytics', sector: 'Data & Analytics', website: 'https://nimbus-analytics.example', about: 'Analytics consulting for retail and BFSI clients.' },
  { name: 'Kestrel Systems', sector: 'Product / SaaS', website: 'https://kestrel.example', about: 'B2B SaaS platform for logistics visibility.' },
  { name: 'Orbitron Semiconductors', sector: 'Semiconductors', website: 'https://orbitron.example', about: 'Fabless chip design house building low-power SoCs.' },
  { name: 'Lumen Fintech', sector: 'Fintech', website: 'https://lumenfin.example', about: 'Digital payments and lending infrastructure.' },
  { name: 'Verdant Motors', sector: 'Automotive', website: 'https://verdantmotors.example', about: 'Electric two-wheeler manufacturer.' },
  { name: 'Cobalt AI Labs', sector: 'AI Research', website: 'https://cobalt-ai.example', about: 'Applied NLP and LLM products for enterprises.' },
  { name: 'Stratus Cloudworks', sector: 'Cloud Infrastructure', website: 'https://stratus.example', about: 'Managed Kubernetes and cloud cost optimisation.' },
  { name: 'Pixelforge Studios', sector: 'Consumer Apps', website: 'https://pixelforge.example', about: 'Mobile apps and games with 50M+ installs.' },
];

// Drives. `phase` drives what the seed script does with each one:
//   completed -> applications + rounds graded + offers + accepted, then closed
//   inprocess -> applications + some rounds graded, still open
//   open      -> open for registration, few or no applications
//   draft     -> created by recruiter, not yet published
export const drives = [
  { company: 'Lumen Fintech', title: 'Software Engineer - Payments Backend', job_type: 'FTE', ctc: 18, loc: 'Bengaluru', min_cgpa: 7.5, max_bl: 0, batch: 2027, depts: ['CS', 'AIML'], skills: ['Java', 'Spring Boot', 'SQL', 'System Design'], phase: 'completed',
    rounds: [['Online Assessment', 'OA'], ['Technical Interview', 'Technical'], ['HR Interview', 'HR']],
    jd: 'Build high-throughput payment processing and reconciliation microservices in Java and Spring Boot. Design relational schemas in PostgreSQL, write efficient SQL, and own services end to end from design to production monitoring. Strong DSA and system design fundamentals required.' },
  { company: 'Nimbus Analytics', title: 'Data Analyst', job_type: 'FTE', ctc: 8.5, loc: 'Bengaluru', min_cgpa: 6.5, max_bl: 1, batch: 2027, depts: [], skills: ['SQL', 'Python', 'Power BI', 'Data Analysis'], phase: 'completed',
    rounds: [['Aptitude + SQL Test', 'OA'], ['Case Study Interview', 'Technical']],
    jd: 'Analyse client sales and customer data, build Power BI dashboards, write complex SQL queries and automate reporting in Python. Present insights to business stakeholders and run A/B test analysis.' },
  { company: 'Orbitron Semiconductors', title: 'Design Verification Engineer', job_type: 'FTE', ctc: 14, loc: 'Hyderabad', min_cgpa: 7.0, max_bl: 0, batch: 2027, depts: ['EC', 'EE'], skills: ['Verilog', 'VLSI', 'C'], phase: 'completed',
    rounds: [['Digital Electronics Test', 'OA'], ['Technical Interview', 'Technical']],
    jd: 'Verify complex digital IP blocks using SystemVerilog and UVM testbenches. Write RTL in Verilog, debug waveforms, close functional coverage and work with the design team on timing and low-power intent.' },
  { company: 'Cobalt AI Labs', title: 'ML Engineer - NLP', job_type: 'FTE', ctc: 28, loc: 'Bengaluru', min_cgpa: 8.0, max_bl: 0, batch: 2027, depts: ['CS', 'AIML'], skills: ['Python', 'PyTorch', 'NLP', 'Deep Learning'], phase: 'inprocess',
    rounds: [['ML Coding Assessment', 'OA'], ['ML Depth Interview', 'Technical'], ['Research Discussion', 'Technical'], ['HR', 'HR']],
    jd: 'Train and fine-tune transformer language models, build retrieval augmented generation pipelines with embeddings and vector search, and deploy models to production APIs. Requires PyTorch, solid ML fundamentals and NLP project experience.' },
  { company: 'Kestrel Systems', title: 'Full Stack Developer', job_type: 'Intern+FTE', ctc: 16, loc: 'Pune', min_cgpa: 7.0, max_bl: 0, batch: 2027, depts: ['CS', 'AIML', 'EC'], skills: ['React', 'Next.js', 'Node.js', 'TypeScript'], phase: 'inprocess',
    rounds: [['Coding Round', 'OA'], ['Frontend + API Interview', 'Technical'], ['Managerial Round', 'HR']],
    jd: 'Develop features across a React and Next.js frontend and Node.js services. Build dashboards for logistics tracking, design REST APIs, write TypeScript with tests and care about UI performance and accessibility.' },
  { company: 'Stratus Cloudworks', title: 'Site Reliability Engineer', job_type: 'FTE', ctc: 22, loc: 'Remote', min_cgpa: 7.5, max_bl: 0, batch: 2027, depts: ['CS', 'EC'], skills: ['Linux', 'Kubernetes', 'AWS', 'Docker', 'Go'], phase: 'open',
    rounds: [['Linux & Networking Test', 'OA'], ['SRE Interview', 'Technical'], ['HR', 'HR']],
    jd: 'Run large Kubernetes fleets on AWS, automate infrastructure with Terraform and CI/CD pipelines, build observability with Prometheus and Grafana, and respond to production incidents. Go or Python scripting expected.' },
  { company: 'Verdant Motors', title: 'Graduate Engineer Trainee - Design', job_type: 'FTE', ctc: 7.2, loc: 'Chennai', min_cgpa: 6.5, max_bl: 1, batch: 2027, depts: ['ME', 'EE'], skills: ['SolidWorks', 'ANSYS', 'AutoCAD'], phase: 'open',
    rounds: [['Technical Test', 'OA'], ['Interview', 'Technical']],
    jd: 'Design vehicle chassis and battery enclosure components in SolidWorks, perform structural and thermal FEA in ANSYS, and prepare manufacturing drawings with GD&T for electric two-wheelers.' },
  { company: 'Pixelforge Studios', title: 'Android Developer', job_type: 'FTE', ctc: 12, loc: 'Bengaluru', min_cgpa: 7.0, max_bl: 0, batch: 2027, depts: ['CS', 'AIML'], skills: ['Android', 'Java', 'Git'], phase: 'open',
    rounds: [['App Building Assignment', 'OA'], ['Technical Interview', 'Technical']],
    jd: 'Build and ship Android features for consumer apps with millions of users using Java/Kotlin, MVVM, Room and Jetpack. Optimise app startup time and write unit tests.' },
  { company: 'Orbitron Semiconductors', title: 'Embedded Firmware Intern', job_type: 'Internship', ctc: 4.8, loc: 'Hyderabad', min_cgpa: 7.0, max_bl: 0, batch: 2028, depts: ['EC', 'EE'], skills: ['Embedded C', 'C', 'IoT'], phase: 'open',
    rounds: [['C Programming Test', 'OA'], ['Interview', 'Technical']],
    jd: 'Six month internship writing firmware in embedded C for ARM microcontrollers, building drivers for sensors over I2C and SPI, and testing low-power IoT reference boards.' },
  { company: 'Cobalt AI Labs', title: 'Data Science Intern', job_type: 'Internship', ctc: 6, loc: 'Bengaluru', min_cgpa: 7.5, max_bl: 0, batch: 2028, depts: ['CS', 'AIML'], skills: ['Python', 'Machine Learning', 'Pandas'], phase: 'open',
    rounds: [['Python + ML Test', 'OA'], ['Interview', 'Technical']],
    jd: 'Clean and analyse datasets, build classical machine learning baselines, and help evaluate language model outputs. Python, pandas and scikit-learn required.' },
  { company: 'Lumen Fintech', title: 'Platform Engineer (Dream)', job_type: 'FTE', ctc: 32, loc: 'Bengaluru', min_cgpa: 8.0, max_bl: 0, batch: 2027, depts: ['CS', 'AIML'], skills: ['Go', 'System Design', 'Kubernetes', 'DSA'], phase: 'open',
    rounds: [['Hard DSA Round', 'OA'], ['System Design', 'Technical'], ['Bar Raiser', 'Technical'], ['HR', 'HR']],
    jd: 'Design and build the core ledger platform handling millions of transactions a day. Distributed systems, Go services, Kubernetes, strong data structures and system design skills.' },
  { company: 'Kestrel Systems', title: 'Product Analyst', job_type: 'FTE', ctc: 11, loc: 'Pune', min_cgpa: 7.0, max_bl: 0, batch: 2027, depts: [], skills: ['SQL', 'Data Analysis', 'Excel', 'Communication'], phase: 'draft',
    rounds: [['Analytics Case', 'OA'], ['PM Interview', 'Technical']],
    jd: 'Define product metrics, run SQL analyses on usage data, build dashboards and work with product managers to prioritise features.' },
];
