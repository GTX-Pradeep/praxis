// Fixed content for the demo dataset (used by scripts/db-demo.mjs).
// All people, emails and GitHub accounts here are invented.

export const BRANCHES = {
  CSE: { code: "CS", full: "Computer Science and Engineering" },
  AIML: { code: "AM", full: "Artificial Intelligence and Machine Learning" },
  ECE: { code: "EC", full: "Electronics and Communication Engineering" },
  ISE: { code: "IS", full: "Information Science and Engineering" },
};

// ---------------------------------------------------------------------------
// Research themes: the skills students in that area tend to have, and the kind
// of repositories they build. Repo descriptions also become resume projects.
// languages: share of code per language (bytes are generated from these)
// ---------------------------------------------------------------------------
export const THEMES = {
  medical: {
    center: "Center for Medical AI",
    branches: ["AIML", "CSE", "ECE"],
    skills: [["Python", 5], ["PyTorch", 4], ["Computer Vision", 4], ["OpenCV", 3], ["TensorFlow", 3], ["scikit-learn", 3]],
    repos: [
      ["brats-unet3d", "3D U-Net for brain tumour segmentation on the BraTS MRI dataset", ["pytorch", "medical-imaging", "segmentation"], { Python: 0.9, Shell: 0.1 }],
      ["chest-xray-classifier", "Pneumonia detection from chest X-rays with transfer learning on DenseNet-121", ["deep-learning", "medical-imaging"], { Python: 0.6, "Jupyter Notebook": 0.4 }],
      ["retina-dr-grading", "Diabetic retinopathy severity grading from retinal fundus images", ["computer-vision", "pytorch"], { Python: 1 }],
      ["skin-lesion-seg", "Skin lesion segmentation on the ISIC dataset with an attention U-Net", ["segmentation", "medical-imaging"], { Python: 0.85, "Jupyter Notebook": 0.15 }],
      ["ecg-arrhythmia-cnn", "1D CNN for ECG arrhythmia classification on MIT-BIH recordings", ["signal-processing", "deep-learning"], { Python: 1 }],
      ["dicom-toolkit", "Utilities to convert and anonymise DICOM scans for machine learning pipelines", ["dicom", "medical-imaging"], { Python: 1 }],
      ["covid-ct-gradcam", "Explainable COVID-19 CT classification with Grad-CAM heatmaps", ["explainable-ai", "computer-vision"], { Python: 0.7, "Jupyter Notebook": 0.3 }],
    ],
    achievements: ["Best paper award, student track, IEEE healthcare AI workshop", "Finalist, Smart India Hackathon (healthcare)", "Kaggle bronze medal, medical image segmentation"],
  },
  nlp: {
    center: "Center for Natural Language Processing",
    branches: ["CSE", "AIML", "ISE"],
    skills: [["Python", 5], ["NLP", 4], ["Transformers", 4], ["PyTorch", 3], ["scikit-learn", 3], ["FastAPI", 2]],
    repos: [
      ["kannada-asr", "Speech-to-text for Kannada by fine-tuning wav2vec2 on open speech corpora", ["speech", "nlp", "indic"], { Python: 0.9, Shell: 0.1 }],
      ["legal-summarizer", "Abstractive summarisation of Indian court judgments with BART", ["nlp", "summarization", "transformers"], { Python: 1 }],
      ["indic-ner", "Named entity recognition for Hindi and Kannada using IndicBERT", ["nlp", "ner", "indic"], { Python: 0.8, "Jupyter Notebook": 0.2 }],
      ["rag-campus-bot", "Retrieval-augmented chatbot that answers questions about university regulations", ["rag", "llm", "nlp"], { Python: 0.7, TypeScript: 0.3 }],
      ["tweet-sentiment", "Sentiment analysis of tweets with a fine-tuned DistilBERT model", ["nlp", "sentiment-analysis"], { Python: 1 }],
      ["translit-seq2seq", "Transliteration between Latin script and Devanagari with a seq2seq model", ["nlp", "seq2seq"], { Python: 1 }],
    ],
    achievements: ["Paper accepted at an ACL student workshop", "Winner, Kannada NLP hackathon", "Top 5%, Kaggle text classification challenge"],
  },
  cloud: {
    center: "Center for Cloud Computing and Big Data",
    branches: ["CSE", "ISE"],
    skills: [["Docker", 4], ["Kubernetes", 4], ["Linux", 4], ["SQL", 4], ["Go", 3], ["AWS", 3], ["PostgreSQL", 3], ["Apache Spark", 3], ["Python", 3]],
    repos: [
      ["k8s-autoscaler-lab", "Experiments with Kubernetes HPA and custom metrics for bursty ML inference workloads", ["kubernetes", "autoscaling"], { Go: 0.7, Shell: 0.2, Dockerfile: 0.1 }],
      ["spark-sales-lake", "PySpark data lake for retail sales with Delta tables and data quality checks", ["spark", "data-engineering"], { Python: 0.8, SQL: 0.2 }],
      ["etl-airflow-pg", "Airflow DAGs that load open government data into a PostgreSQL warehouse", ["airflow", "postgresql", "etl"], { Python: 0.75, SQL: 0.25 }],
      ["serverless-image-api", "AWS Lambda image resizing service triggered by S3 uploads, deployed with Terraform", ["aws", "serverless"], { Python: 0.6, HCL: 0.4 }],
      ["log-pipeline", "Log ingestion pipeline with Kafka, ClickHouse and Grafana dashboards", ["kafka", "observability"], { Go: 0.8, Dockerfile: 0.2 }],
      ["terraform-aws-lab", "Terraform modules for a three-tier AWS deployment with CI/CD", ["terraform", "aws", "devops"], { HCL: 0.85, Shell: 0.15 }],
    ],
    achievements: ["AWS Certified Cloud Practitioner", "Winner, inter-college DevOps challenge", "Speaker at the Bengaluru Kubernetes student meetup"],
  },
  robotics: {
    center: "Center for Robotics and Autonomous Systems",
    branches: ["ECE", "CSE", "AIML"],
    skills: [["ROS", 4], ["C++", 4], ["Python", 4], ["OpenCV", 3], ["Embedded C", 3], ["Reinforcement Learning", 2], ["Linux", 3]],
    repos: [
      ["drone-vio-ros2", "Visual-inertial odometry for a quadcopter in ROS 2 and Gazebo", ["ros2", "drone", "slam"], { "C++": 0.7, Python: 0.2, CMake: 0.1 }],
      ["warehouse-amr-planner", "A* and RRT* path planning for warehouse mobile robots", ["path-planning", "robotics"], { "C++": 0.85, Python: 0.15 }],
      ["line-follower-pid", "PID-controlled line-following robot on an STM32 microcontroller", ["embedded", "control"], { C: 0.9, Makefile: 0.1 }],
      ["arm-pick-place-rl", "Reinforcement learning for robotic arm pick-and-place in PyBullet", ["reinforcement-learning", "robotics"], { Python: 1 }],
      ["turtlebot-slam", "2D SLAM on a TurtleBot3 with Cartographer and loop-closure tuning", ["ros", "slam"], { "C++": 0.6, Python: 0.4 }],
      ["yolo-edge-obstacles", "YOLOv8 obstacle detection running on a Jetson Nano", ["computer-vision", "edge-ai"], { Python: 0.7, "C++": 0.3 }],
    ],
    achievements: ["Team lead, e-Yantra robotics competition finalist", "Second place, national drone design contest", "Robocon team member"],
  },
  security: {
    center: "Center for Cyber Security",
    branches: ["CSE", "ISE", "ECE"],
    skills: [["Networking", 4], ["Linux", 4], ["Python", 4], ["Cryptography", 3], ["C++", 3], ["Rust", 2], ["Go", 2]],
    repos: [
      ["malware-cnn-bytes", "Malware family classification from raw bytes with a convolutional network", ["malware-analysis", "deep-learning"], { Python: 1 }],
      ["ids-cicids2017", "Network intrusion detection on CICIDS2017 with gradient boosting", ["intrusion-detection", "machine-learning"], { Python: 0.8, "Jupyter Notebook": 0.2 }],
      ["ctf-writeups", "Writeups and exploit scripts from more than twenty CTF competitions", ["ctf", "security"], { Python: 0.7, C: 0.3 }],
      ["rust-port-scanner", "Asynchronous TCP port scanner and banner grabber written in Rust", ["networking", "rust"], { Rust: 1 }],
      ["tls-handshake-viz", "Visualiser for TLS 1.3 handshakes from packet captures", ["tls", "cryptography"], { Go: 0.8, JavaScript: 0.2 }],
      ["password-entropy", "Password strength estimator with dictionary and pattern matching", ["security", "passwords"], { Python: 1 }],
    ],
    achievements: ["Top 10, national CTF for students", "Reported a security bug acknowledged by a major Indian bank", "Certified ethical hacking workshop, CERT-In"],
  },
  web: {
    center: null,
    branches: ["CSE", "ISE"],
    skills: [["JavaScript", 5], ["TypeScript", 4], ["React", 4], ["Next.js", 3], ["Node.js", 4], ["MongoDB", 3], ["PostgreSQL", 2]],
    repos: [
      ["campus-marketplace", "Buy-and-sell marketplace for students built with Next.js and MongoDB", ["nextjs", "mongodb"], { TypeScript: 0.85, CSS: 0.15 }],
      ["event-booking-api", "Event ticket booking REST API with Node.js, Express and PostgreSQL", ["nodejs", "rest-api"], { JavaScript: 1 }],
      ["portfolio-site", "Personal portfolio website built with React and Tailwind CSS", ["react", "portfolio"], { TypeScript: 0.7, CSS: 0.3 }],
      ["realtime-chat", "Realtime chat app with Socket.io rooms and typing indicators", ["websockets", "nodejs"], { JavaScript: 0.9, CSS: 0.1 }],
      ["expense-tracker-pwa", "Expense tracker progressive web app with charts and offline sync", ["pwa", "react"], { TypeScript: 1 }],
      ["url-shortener", "URL shortener with click analytics, Redis caching and rate limiting", ["redis", "nodejs"], { TypeScript: 1 }],
    ],
    achievements: ["Winner, college web development hackathon", "Freelance websites for two local businesses", "Open-source contributor to a UI component library"],
  },
};

// Popular projects that weaker profiles fork without changing
export const FORKS = ["pytorch", "tensorflow", "react", "transformers", "kubernetes", "awesome-python", "next.js", "opencv", "linux", "yolov5"];

// ---------------------------------------------------------------------------
// Faculty. The first one per center is its head. The last one is unverified
// and registers a brand-new lab, so the admin has something to approve.
// ---------------------------------------------------------------------------
export const FACULTY = [
  { key: "meera", name: "Dr. Meera Krishnan", designation: "Professor", center: "Center for Medical AI", head: true },
  { key: "sanjay", name: "Dr. Sanjay Bhat", designation: "Associate Professor", center: "Center for Medical AI" },
  { key: "lakshmi", name: "Dr. Lakshmi Venkatesh", designation: "Professor", center: "Center for Natural Language Processing", head: true },
  { key: "neha", name: "Dr. Neha Gupta", designation: "Assistant Professor", center: "Center for Natural Language Processing" },
  { key: "farhan", name: "Dr. Farhan Siddiqui", designation: "Associate Professor", center: "Center for Cloud Computing and Big Data", head: true },
  { key: "anitha", name: "Dr. Anitha Raghavan", designation: "Professor", center: "Center for Robotics and Autonomous Systems", head: true },
  { key: "rajesh", name: "Dr. Rajesh Kumar", designation: "Assistant Professor", center: "Center for Cyber Security", head: true },
  { key: "kavya", name: "Dr. Kavya Nair", designation: "Assistant Professor", newCenter: ["Quantum Computing Lab", "Quantum algorithms, error correction and simulators for near-term devices."], verified: false },
];

// ---------------------------------------------------------------------------
// Hand-picked students that the demo story relies on. Everyone else is generated.
//   strength: strong | medium | weak       trajectory: steady | rising | new
// ---------------------------------------------------------------------------
export const KEY_STUDENTS = [
  // past interns of the Medical AI lab, rated 5 → its success profile
  { key: "ananya", name: "Ananya Iyer", theme: "medical", strength: "strong", branch: "AIML", semester: 7, cgpa: 9.42 },
  { key: "vikram", name: "Vikram Hegde", theme: "medical", strength: "strong", branch: "CSE", semester: 7, cgpa: 8.96 },
  // past interns elsewhere
  { key: "priya", name: "Priya Nair", theme: "nlp", strength: "strong", branch: "CSE", semester: 7, cgpa: 9.1 },
  { key: "aditya", name: "Aditya Joshi", theme: "cloud", strength: "strong", branch: "ISE", semester: 7, cgpa: 8.5 },
  { key: "rohan", name: "Rohan Kulkarni", theme: "robotics", strength: "medium", branch: "ECE", semester: 7, cgpa: 7.8 },
  // currently interning (to complete and rate live)
  { key: "arjun", name: "Arjun Shetty", theme: "medical", strength: "strong", branch: "AIML", semester: 5, cgpa: 8.74 },
  // both hold an offer for the same single seat (transaction demo)
  { key: "karthik", name: "Karthik Rao", theme: "medical", strength: "strong", branch: "CSE", semester: 6, cgpa: 8.88 },
  { key: "divya", name: "Divya Menon", theme: "medical", strength: "medium", branch: "AIML", semester: 6, cgpa: 9.05 },
  // impressive-looking resume, but GitHub is forks plus one night of commits
  { key: "rahul", name: "Rahul Verma", theme: "medical", strength: "weak", branch: "CSE", semester: 6, cgpa: 8.92, forkHeavy: true },
  // second-year whose proof-of-work is climbing fast (momentum demo)
  { key: "sneha", name: "Sneha Patil", theme: "nlp", strength: "strong", branch: "AIML", semester: 3, cgpa: 8.41, trajectory: "breakout" },
  // strong medical student who hasn't applied yet; Dr. Meera has invited her (invitation demo)
  { key: "tara", name: "Tara Fernandes", theme: "medical", strength: "strong", branch: "AIML", semester: 6, cgpa: 9.21 },
  // strong web developer: high proof-of-work, but not a research fit for medical imaging
  { key: "nikhil", name: "Nikhil Agarwal", theme: "web", strength: "strong", branch: "CSE", semester: 6, cgpa: 8.2 },
];

export const FIRST_NAMES = [
  "Aarav", "Diya", "Ishaan", "Kavya", "Manav", "Pooja", "Siddharth", "Tanvi", "Varun", "Meghana",
  "Harsha", "Riya", "Akash", "Shreya", "Pranav", "Nandini", "Yash", "Aishwarya", "Rahul", "Swathi",
  "Gautam", "Bhavana", "Kiran", "Lavanya", "Mohit", "Anjali", "Suhas", "Keerthi", "Abhishek", "Deepika",
  "Tejas", "Spoorthi", "Chirag", "Ramya", "Vivek", "Sanjana",
];
export const LAST_NAMES = [
  "Sharma", "Reddy", "Pillai", "Desai", "Mehta", "Rangan", "Bhat", "Kamath", "Naidu", "Prasad",
  "Shenoy", "Murthy", "Chandra", "Gowda", "Banerjee", "Kapoor", "Srinivasan", "Ghosh", "Jain", "Mishra",
  "Rao", "Kaur", "Malhotra", "Pai", "Nayak", "Subramanian", "Hiremath", "Krishna", "Das", "Yadav",
  "Patel", "Saxena", "Acharya", "Varma", "Iyengar", "Joshi",
];

// Theme mix and strengths for the generated students (36 of them)
export const GENERATED_MIX = [
  ["medical", 6], ["nlp", 6], ["cloud", 7], ["robotics", 5], ["security", 6], ["web", 6],
];

// ---------------------------------------------------------------------------
// Openings. `past` ones are completed internships from the summer; `ongoing`
// has an intern in progress; the rest are open now with applications.
// plan: how many applicants and how far each has got
// ---------------------------------------------------------------------------
export const PAST_OPENINGS = [
  {
    faculty: "meera", title: "Chest X-ray triage model (Summer 2026)", domain: "Medical Imaging", seats: 2,
    description: "Train and validate a deep learning model that flags urgent chest X-rays for radiologist review, with calibrated confidence and saliency maps.",
    skills: [["PyTorch", 5], ["Computer Vision", 4], ["Python", 4]], minCgpa: 8, weeks: 10, stipend: 12000,
    interns: [
      { student: "ananya", rating: 5, endorse: ["PyTorch", "Computer Vision"], remarks: "Outstanding: built the full training pipeline and co-authored our workshop paper." },
      { student: "vikram", rating: 5, endorse: ["Python", "OpenCV"], remarks: "Reliable and fast; his preprocessing toolkit is now used by the whole lab." },
    ],
    rejected: 2, daysAgo: { created: 170, deadline: 150, start: 140, end: 70 },
  },
  {
    faculty: "lakshmi", title: "Indic named entity recognition (Summer 2026)", domain: "Natural Language Processing", seats: 1,
    description: "Build a named entity recognition dataset and baseline models for Kannada news text using multilingual transformers.",
    skills: [["NLP", 5], ["Transformers", 4], ["Python", 4]], minCgpa: 7.5, weeks: 8, stipend: 8000,
    interns: [{ student: "priya", rating: 5, endorse: ["NLP", "Transformers"], remarks: "Excellent annotator guidelines and a strong IndicBERT baseline." }],
    rejected: 1, daysAgo: { created: 165, deadline: 145, start: 135, end: 80 },
  },
  {
    faculty: "farhan", title: "Open-data ETL warehouse (Summer 2026)", domain: "Data Engineering", seats: 1,
    description: "Design ETL pipelines that load public datasets into a PostgreSQL warehouse and expose them through dashboards.",
    skills: [["SQL", 5], ["Docker", 4], ["Python", 3]], minCgpa: 7, weeks: 8, stipend: 8000,
    interns: [{ student: "aditya", rating: 4, endorse: ["SQL", "Docker"], remarks: "Solid pipeline design; documentation could be more thorough." }],
    rejected: 1, daysAgo: { created: 160, deadline: 140, start: 130, end: 75 },
  },
  {
    faculty: "anitha", title: "TurtleBot SLAM benchmarking (Summer 2026)", domain: "Robotics", seats: 1,
    description: "Benchmark 2D SLAM algorithms on TurtleBot3 robots in our lab corridors and report accuracy and compute cost.",
    skills: [["ROS", 5], ["C++", 4], ["Linux", 3]], minCgpa: 7, weeks: 8, stipend: 6000,
    interns: [{ student: "rohan", rating: 3, endorse: ["ROS"], remarks: "Completed the benchmarks, but needed frequent guidance." }],
    rejected: 0, daysAgo: { created: 158, deadline: 138, start: 128, end: 72 },
  },
];

export const ONGOING_OPENING = {
  faculty: "meera", title: "Federated learning on hospital data", domain: "Medical Imaging", seats: 1,
  description: "Prototype privacy-preserving federated training of a segmentation model across three simulated hospital sites.",
  skills: [["PyTorch", 5], ["Python", 4], ["Docker", 2]], minCgpa: 8, weeks: 12, stipend: 15000,
  intern: "arjun", daysAgo: { created: 75, deadline: 55, start: 40 },
};

export const CURRENT_OPENINGS = [
  {
    key: "mri", faculty: "meera", title: "Brain MRI tumour segmentation intern", domain: "Medical Imaging", seats: 2,
    description: "Build and evaluate U-Net style deep learning models that segment tumours in brain MRI scans, and measure them with Dice score against expert annotations.",
    skills: [["PyTorch", 5], ["Computer Vision", 4], ["Python", 4], ["OpenCV", 2]], minCgpa: 8, semesters: [5, 6, 7], weeks: 10, stipend: 12000,
    deadlineDays: 12, threshold: 0.65,
    applicants: ["rahul", "nikhil"], plan: { theme: "medical", count: 5, shortlisted: 2, rejected: 1 },
  },
  {
    key: "retina", faculty: "meera", title: "Diabetic retinopathy grading intern", domain: "Medical Imaging", seats: 1,
    description: "Train convolutional networks to grade diabetic retinopathy severity from retinal fundus images and study where the model disagrees with clinicians.",
    skills: [["Computer Vision", 5], ["PyTorch", 4], ["Python", 3]], minCgpa: 8, semesters: [5, 6, 7], weeks: 8, stipend: 10000,
    deadlineDays: 6, threshold: 0.65,
    applicants: ["karthik", "divya"], offered: ["karthik", "divya"], plan: { theme: "medical", count: 4 },
  },
  {
    key: "ecg", faculty: "sanjay", title: "ECG arrhythmia detection on wearables", domain: "Biomedical Signal Processing", seats: 1,
    description: "Develop lightweight neural networks that detect arrhythmias from single-lead ECG signals recorded by low-cost wearable devices.",
    skills: [["Python", 4], ["TensorFlow", 4], ["scikit-learn", 3]], minCgpa: 7.5, semesters: [], weeks: 8, stipend: 8000,
    deadlineDays: 20, threshold: 0.7, plan: { theme: "medical", count: 3, shortlisted: 1 },
  },
  {
    key: "asr", faculty: "lakshmi", title: "Kannada speech recognition intern", domain: "Natural Language Processing", seats: 2,
    description: "Fine-tune self-supervised speech models for Kannada speech-to-text and build an evaluation set from local radio broadcasts.",
    skills: [["NLP", 4], ["PyTorch", 4], ["Python", 4], ["Transformers", 3]], minCgpa: 7.5, semesters: [5, 6, 7], weeks: 10, stipend: 10000,
    deadlineDays: 15, threshold: 0.65, plan: { theme: "nlp", count: 4, shortlisted: 1, offered: 1 },
  },
  {
    key: "legal", faculty: "lakshmi", title: "Legal judgment summarisation", domain: "Natural Language Processing", seats: 1,
    description: "Summarise long Indian court judgments with transformer models and evaluate faithfulness with legal experts.",
    skills: [["Transformers", 5], ["NLP", 4], ["Python", 3]], minCgpa: 8, semesters: [6, 7], weeks: 8, stipend: 9000,
    deadlineDays: 9, threshold: 0.7, plan: { theme: "nlp", count: 3, rejected: 1 },
  },
  {
    key: "rag", faculty: "neha", title: "Campus question-answering assistant", domain: "Natural Language Processing", seats: 2,
    description: "Build a retrieval-augmented assistant that answers student questions about university rules, with citations to the source documents.",
    skills: [["NLP", 4], ["Python", 4], ["FastAPI", 3]], minCgpa: 7, semesters: [], weeks: 6, stipend: 5000,
    deadlineDays: 25, threshold: 0.6, applicants: ["sneha"], plan: { theme: "nlp", count: 3 },
  },
  {
    key: "k8s", faculty: "farhan", title: "Kubernetes autoscaling for ML inference", domain: "Cloud Computing", seats: 1,
    description: "Design autoscaling policies for GPU-backed model inference on Kubernetes and benchmark latency and cost under bursty traffic.",
    skills: [["Kubernetes", 5], ["Docker", 4], ["Go", 3], ["Linux", 3]], minCgpa: 7.5, semesters: [5, 6, 7], weeks: 10, stipend: 12000,
    deadlineDays: 14, threshold: 0.65, plan: { theme: "cloud", count: 4, shortlisted: 2, rejected: 1 },
  },
  {
    key: "lake", faculty: "farhan", title: "Real-time data lake on Spark", domain: "Data Engineering", seats: 2,
    description: "Build a streaming data lake with Spark Structured Streaming and Delta tables for campus energy-meter data.",
    skills: [["Apache Spark", 5], ["SQL", 4], ["Python", 3]], minCgpa: 7, semesters: [], weeks: 8, stipend: 8000,
    deadlineDays: 18, threshold: 0.65, plan: { theme: "cloud", count: 3, shortlisted: 1 },
  },
  {
    key: "drone", faculty: "anitha", title: "Vision-based drone navigation in ROS 2", domain: "Robotics", seats: 2,
    description: "Implement visual-inertial navigation for indoor drones in ROS 2, test in Gazebo, then fly in the lab arena.",
    skills: [["ROS", 5], ["C++", 4], ["OpenCV", 3], ["Python", 3]], minCgpa: 7.5, semesters: [5, 6, 7], weeks: 12, stipend: 10000,
    deadlineDays: 16, threshold: 0.65, plan: { theme: "robotics", count: 4, shortlisted: 1, offered: 1 },
  },
  {
    key: "amr", faculty: "anitha", title: "Warehouse robot path planning", domain: "Robotics", seats: 1,
    description: "Compare sampling-based and search-based planners for fleets of warehouse robots in simulation.",
    skills: [["C++", 4], ["ROS", 4], ["Reinforcement Learning", 3]], minCgpa: 7, semesters: [], weeks: 8, stipend: 7000,
    deadlineDays: 22, threshold: 0.65, plan: { theme: "robotics", count: 2 },
  },
  {
    key: "malware", faculty: "rajesh", title: "Malware classification with deep learning", domain: "Cyber Security", seats: 1,
    description: "Classify malware families from binary byte sequences with deep learning and study evasion by adversarial padding.",
    skills: [["Python", 4], ["Networking", 3], ["Cryptography", 2], ["PyTorch", 3]], minCgpa: 7.5, semesters: [5, 6, 7], weeks: 8, stipend: 8000,
    deadlineDays: 10, threshold: 0.65, plan: { theme: "security", count: 4, shortlisted: 1, rejected: 1, withdrawn: 1 },
  },
  {
    key: "ids", faculty: "rajesh", title: "Network intrusion detection on campus traffic", domain: "Cyber Security", seats: 2,
    description: "Build and evaluate intrusion detection models on anonymised campus network flows, with a focus on low false-positive rates.",
    skills: [["Networking", 5], ["Linux", 4], ["Python", 3]], minCgpa: 7, semesters: [], weeks: 10, stipend: 8000,
    deadlineDays: 27, threshold: 0.65, plan: { theme: "security", count: 3 },
  },
];

export const SOPS = [
  "I have worked on a closely related project and would love to take it further with your lab.",
  "This opening matches what I have been building in my free time; my repositories show the work.",
  "I want to move from coursework to real research, and this problem is exactly what interests me.",
  "I enjoyed the related elective and built a small prototype; I would like to learn the research process.",
  "My recent project used the same tools, and I am comfortable reading papers and reproducing results.",
];

// Faculty invite strong students who haven't applied: [faculty, opening key, student key | theme, message, declined?]
export const INVITATIONS = [
  ["meera", "mri", "tara", "Your segmentation repositories are exactly what this project needs. I'd love to see your application."],
  ["lakshmi", "legal", "theme:nlp", "Your transformer projects look strong; this opening may interest you."],
  ["farhan", "lake", "theme:cloud", "We liked your data pipeline work. Consider applying!", true],
];
