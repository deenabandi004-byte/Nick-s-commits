import { useParams, Navigate } from 'react-router-dom';
import { companies } from '@/data/companies';
import MeetingGuide from './templates/MeetingGuide';

const MeetingGuidePage = () => {
  const { slug } = useParams<{ slug: string }>();
  const company = companies.find((c) => c.slug === slug);

  if (!company) {
    return <Navigate to="/" replace />;
  }

  return <MeetingGuide company={company} />;
};

export default MeetingGuidePage;
