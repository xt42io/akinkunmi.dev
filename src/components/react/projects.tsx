const Projects = () => {
  const projects = [
    {
      title: "OutRay",
      description: "Open-source ngrok alternative.",
      url: "https://outray.dev",
    },
    {
      title: "Byteship",
      description: "File uploads, storage and delivery.",
      url: "https://byteship.dev",
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
  ];

  return (
    <section aria-labelledby="projects-heading">
      <div className="projects-heading">
        <h2 id="projects-heading">Projects</h2>
      </div>
      <ul>
        {projects.map((project) => (
          <li key={project.title} className="border-b border-hairline last:border-b-0">
            <a
              href={project.url}
              target="_blank"
              rel="noreferrer"
              className="project-link"
            >
              <span className="project-link__name">{project.title}</span>
              <span className="project-link__description">
                {project.description}
              </span>
              <svg className="project-link__arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
                <path d="M4 12 12 4M4 4h8v8" />
              </svg>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
};

export default Projects;
