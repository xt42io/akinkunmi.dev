interface Props {
  name: string;
  description: string;
  website?: string;
  github?: string;
  twitter?: string;
  tags?: string[];
  status?: string;
}

export const projects: Props[] = [
  {
    name: "Destino",
    description: "File-based routing framework based on Express.js.",
    website: "https://destino.run",
    github: "https://github.com/akinloluwami/destino",
    status: "wip",
  },
  {
    name: "UploadFly",
    description: "Really simple file uploads infrastructure.",
    // website: "https://www.uploadfly.co",
    github: "https://github.com/uploadfly/uploadfly",
    tags: ["TypeScript", "S3", "Next.js", "TailwindCSS", "MySQL", "Prisma"],
  },
  {
    name: "LogDrop",
    description: "API analytics, logging, monitoring and alerts for NodeJS.",
    // website: "https://www.logdrop.co",
    github: "https://github.com/akinloluwami/logdrop",
    tags: ["TypeScript", "Next.js", "TailwindCSS", "Postgres", "Prisma"],
  },
];
