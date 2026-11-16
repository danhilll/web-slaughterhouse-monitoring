import { Star } from 'lucide-react';
import { manilaTime } from './displayTime';
import { starsText, type FeedbackRow } from './deliveryFeedback';
import { Fields, Note } from './ui/RecordParts';

/** Five stars with the rating also as text, so meaning never depends on the icons alone. */
export function Stars({ rating }: { rating: number }) {
  return <span className="feedback-stars" role="img" aria-label={starsText(rating)}>
    {[1, 2, 3, 4, 5].map(n => <Star key={n} size={15} aria-hidden="true" className={n <= rating ? 'is-filled' : ''} />)}
  </span>;
}

/** Read-only Vendor rating for a completed delivery. Feedback is shown as plain text. */
export function DeliveryFeedbackView({ delivered, feedback, status }: { delivered: boolean; feedback?: FeedbackRow; status: 'loading' | 'error' | 'ready' }) {
  if (!delivered) return null;
  if (status === 'loading') return <p className="record-sub" role="status">Loading Vendor rating…</p>;
  if (status === 'error') return <Note tone="warning">Vendor rating unavailable. Refresh to retry.</Note>;
  if (!feedback) return <Fields rows={[['Vendor rating', 'Not rated yet']]} />;
  return <Fields rows={[
    ['Vendor rating', <><Stars rating={feedback.rating} /> {starsText(feedback.rating)}</>],
    ['Rated', manilaTime(feedback.submittedAt)],
    ['Vendor feedback', feedback.comment === null ? 'None given' : <span className="feedback-comment">{feedback.comment}</span>],
  ]} />;
}
