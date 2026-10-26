import { featuredProjects, type Project } from "../../content/projects";

interface Props {
  items?: Project[];
  headingLevel?: "h1" | "h2";
  showMoreLink?: boolean;
}

const Projects = ({ items = featuredProjects, headingLevel = "h2", showMoreLink = false }: Props) => {
  const Heading = headingLevel;

  return (
    <section aria-labelledby="projects-heading">
      <div className="projects-heading">
        <Heading id="projects-heading">Projects</Heading>
      </div>
      <ul>
        {items.map((project) => (
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
      {showMoreLink && (
        <a href="/projects" className="projects-more">
          More projects <span aria-hidden="true">→</span>
        </a>
      )}
    </section>
  );
};

export default Projects;
