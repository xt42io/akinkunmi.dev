import Reactions from "./Reactions";

interface ReactionsWrapperProps {
  slug: string;
}

export default function ReactionsWrapper({ slug }: ReactionsWrapperProps) {
  return <Reactions slug={slug} />;
}
