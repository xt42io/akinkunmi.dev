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
      <ul className="project-list">
        {items.map((project) => (
          <li key={project.title}>
            <a
              href={project.url}
              target="_blank"
              rel="noreferrer"
              className="project-link"
            >
              <span className="project-link__name">
                {project.title}
                <svg className="project-link__arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m6 3 5 5-5 5" />
                </svg>
              </span>
              <span className="project-link__description">
                {project.description}
              </span>
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
