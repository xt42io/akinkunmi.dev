export interface Project {
  title: string;
  description: string;
  url: string;
}

const outray: Project = {
  title: "OutRay",
  description: "Open-source ngrok alternative.",
  url: "https://outray.dev",
};

const byteship: Project = {
  title: "Byteship",
  description: "File uploads, storage and delivery.",
  url: "https://byteship.dev",
};

const avnac: Project = {
  title: "Avnac",
  description: "Open-source Canva alternative.",
  url: "https://avnac.design",
};

const betterSecrets: Project = {
  title: "Better Secrets",
  description: "A better way to manage GitHub Actions secrets.",
  url: "https://better-secrets.xyz",
};

const toolbaze: Project = {
  title: "Toolbaze",
  description: "A collection of useful everyday tools.",
  url: "https://toolbaze.com",
};

const envii: Project = {
  title: "Envii",
  description: "Backup and restore your environment variables across machines.",
  url: "https://envii.dev",
};

export const featuredProjects: Project[] = [
  outray,
  byteship,
  avnac,
  betterSecrets,
  toolbaze,
  envii,
];

// Prefer accessible GitHub About websites. Only public repos can be fallbacks.
export const projects: Project[] = [
  outray,
  byteship,
  {
    title: "Aeroplane",
    description: "Deploy apps and databases on your own server.",
    url: "https://aeroplane.run",
  },
  {
    title: "RevIndex",
    description: "Discover Nigerian businesses and their verified revenues.",
    url: "https://revindex.ng",
  },
  avnac,
  {
    title: "Drocsid",
    description: "An open-source Discord alternative.",
    url: "https://drocsid.app",
  },
  envii,
  {
    title: "Unodraw",
    description: "A whiteboarding app.",
    url: "https://unodraw.com",
  },
  {
    title: "NotDatabase",
    description: "A type-safe document database for TypeScript.",
    url: "https://github.com/xt42io/notdatabase",
  },
  {
    title: "FormDrop",
    description: "A zero-setup form API.",
    url: "https://formdrop.co",
  },
  toolbaze,
  {
    title: "MoneyPage",
    description: "Turn bank statements into a clear financial overview.",
    url: "https://moneypage.xyz",
  },
  betterSecrets,
  {
    title: "FireFlow",
    description: "Create automated workflows using natural language.",
    url: "https://fireflow.run",
  },
  {
    title: "PathWatch",
    description: "API observability and monitoring.",
    url: "https://github.com/xt42io/pathwatch",
  },
  {
    title: "React Serve",
    description: "A backend framework for React.",
    url: "https://github.com/xt42io/react-serve",
  },
  {
    title: "db-thing",
    description: "Design and visualize database schemas with AI.",
    url: "https://db-thing.vercel.app",
  },
  {
    title: "XMD",
    description: "Download photos and videos from Twitter/X profiles.",
    url: "https://github.com/xt42io/xmd",
  },
  {
    title: "Debby",
    description: "A self-hosted database manager.",
    url: "https://github.com/xt42io/debby",
  },
  {
    title: "Timely",
    description: "A simple stopwatch app for macOS.",
    url: "https://github.com/xt42io/timely",
  },
  {
    title: "OpenFork",
    description: "Discover open-source projects to contribute to.",
    url: "https://github.com/xt42io/openfork",
  },
  {
    title: "Hodio",
    description: "A voice recorder with real-time transcription.",
    url: "https://github.com/xt42io/hodio",
  },
];
