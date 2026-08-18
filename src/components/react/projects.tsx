function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

const Projects = () => {
  const projects = [
    {
      title:"Byteship",
      description:"File uploads, storage and delivery.",
      url:"https://byteship.dev"
    },
{
      title: "Avnac",
      description: "Open-source Canva alternative.",
      url: "https://avnac.design",
    },
    {
      title: "Better Secrets",
      description: "A better way to manage GitHub Actions secrets.",
      url: "https://better-secrets.xyz",
    },
    {
      title: "FireFlow",
      description: "Create automated workflows using natural language.",
      url: "https://fireflow.run",
    },
    {
      title: "Envii",
      description:
        "Backup and restore your environment variables across machines.",
      url: "https://envii.dev",
    },
    {
      title: "OutRay",
      description: "Open-source ngrok alternative.",
      url: "https://outray.dev",
    },
    {
      title: "FormDrop",
      description: "Super simple headless form backend.",
      url: "https://formdrop.co",
    },
    {
      title: "PathWatch",
      description: "API observability and monitoring tool.",
      url: "https://github.com/akinloluwami/pathwatch",
    },
    {
      title: "ReactServe",
      description: "The missing backend framework for React.",
      url: "https://react-serve.run",
    },
  ];

  return (
    <section>
      <h2 className="font-serif text-[1.35rem] sm:text-2xl font-medium text-off-white tracking-tight mb-10 pb-4 border-b border-hairline">
        Projects
      </h2>
      <ul>
        {projects.map((project) => {
          const host = hostFromUrl(project.url);
          return (
            <li key={project.title} className="border-b border-hairline last:border-b-0">
              <a
                href={project.url}
                target="_blank"
                rel="noreferrer"
                className="group block py-6 sm:py-7 -mx-1 px-1 sm:px-2 -ml-2 sm:-ml-3 border-l-2 border-transparent hover:border-accent/55 pl-3 sm:pl-4 transition-colors"
              >
                <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2 sm:gap-6">
                  <div className="min-w-0">
                    <span className="font-serif text-[1.05rem] sm:text-lg text-off-white group-hover:text-accent transition-colors">
                      {project.title}
                    </span>
                    {host ? (
                      <span className="mt-1.5 block font-sans text-2xs uppercase tracking-[0.14em] text-muted-faint group-hover:text-muted transition-colors">
                        {host}
                      </span>
                    ) : null}
                  </div>
                  <span
                    className="shrink-0 font-sans text-muted-faint opacity-0 group-hover:opacity-100 transition-opacity text-sm hidden sm:block"
                    aria-hidden
                  >
                    ↗
                  </span>
                </div>
                <p className="mt-3 text-[15px] leading-relaxed text-muted max-w-xl">
                  {project.description}
                </p>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export default Projects;
