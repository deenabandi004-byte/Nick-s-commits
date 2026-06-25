import { useState } from 'react';
import './BulletinBoard.css';
import DylanRobyPhoto from '@/assets/Dylan-Roby.jpeg';
import JacksonLeckPhoto from '@/assets/Jackson-Leck.jpeg';
import VibushaVadivelPhoto from '@/assets/Vibusha-Vadivel.jpeg';
import EliHamouPhoto from '@/assets/EliHamou.png';
import MatthewDolinsPhoto from '@/assets/Matthew-Dolins.png';
import LukeBrooksPhoto from '@/assets/Luke-Brooks.jpeg';
import RoccoLepianePhoto from '@/assets/Rocco-Lepiane.jpeg';
import JuliannaSeymourPhoto from '@/assets/Julianna-Seymour.jpeg';
import ReeseHafnerPhoto from '@/assets/Reese-Hafner.jpeg';
import LouisFaillacePhoto from '@/assets/Louis-Faillace.jpeg';
import LandingThumbtack from '@/assets/landing-thumbtack.png';
import DoodleLoopArrow from '@/assets/for-students/doodle-loop-arrow.png';

type Note = {
  type: 'landed' | 'review';
  quote: string;
  name: string;
  role: string;
  tack: string;
  rotate: number;
  pinOffset: number;
  pinRotate: number;
  photo?: string;
};

// David Ji + Sarah Ucuzoglu live in the two big cards in the testimonials
// section above this component, so they're excluded here to keep the wall
// fresh instead of duplicating those faces.
const notes: Note[] = [
  { type: 'landed', quote: 'Offerloop does the work I spent hundreds of hours doing to land my internship — in minutes.', name: 'Dylan Roby', role: 'IB Analyst, Evercore', tack: 'tack-red', rotate: -1.2, pinOffset: -8, pinRotate: -6, photo: DylanRobyPhoto },
  { type: 'review', quote: 'I had so many recruiting tabs open. Now I have one. Everything I need in a single place.', name: 'Jackson Leck', role: 'PE Intern, Blackstone', tack: 'tack-blue', rotate: 0.8, pinOffset: 4, pinRotate: 5, photo: JacksonLeckPhoto },
  { type: 'landed', quote: 'Sent 12 emails in 10 minutes. Got 4 coffee chats. One turned into my summer offer.', name: 'Vibusha Vadivel', role: 'Incoming SWE Intern, IBM', tack: 'tack-yellow', rotate: 1.4, pinOffset: -4, pinRotate: -8, photo: VibushaVadivelPhoto },
  { type: 'review', quote: 'The coffee chat prep alone saved me hours. I walked into every call actually knowing what to say.', name: 'Eli Hamou', role: 'Audit Intern, Deloitte', tack: 'tack-red', rotate: -1.0, pinOffset: 6, pinRotate: 4, photo: EliHamouPhoto },
  { type: 'landed', quote: 'Got my Deloitte offer after networking with 3 consultants I found through Offerloop in a single afternoon.', name: 'Matthew Dolins', role: 'Incoming Tax Intern, Deloitte', tack: 'tack-blue', rotate: 0.6, pinOffset: -2, pinRotate: 7, photo: MatthewDolinsPhoto },
  { type: 'review', quote: 'I went from spending entire weekends writing emails to having my whole outreach done before Monday.', name: 'Luke Brooks', role: 'CRE Market Research Analyst, Newmark Mountain West', tack: 'tack-green', rotate: 1.1, pinOffset: 0, pinRotate: -3, photo: LukeBrooksPhoto },
  { type: 'landed', quote: 'Used the hiring manager finder on a Lazard posting. Had a coffee chat within a week, offer by November.', name: 'Rocco Lepiane', role: 'Incoming Audit Intern, EY', tack: 'tack-red', rotate: -1.5, pinOffset: 8, pinRotate: 9, photo: RoccoLepianePhoto },
  { type: 'review', quote: 'Finally a tool that understands what students actually need during recruiting season. This is it.', name: 'Reese Hafner', role: 'Incoming Engineer, Raytheon', tack: 'tack-yellow', rotate: 0.4, pinOffset: -6, pinRotate: -5, photo: ReeseHafnerPhoto },
  { type: 'landed', quote: 'I landed 3 coffee chats in my first week. Before Offerloop I couldn\'t even find the right people to email.', name: 'Julianna Seymour', role: 'Audit & Assurance Intern, EY', tack: 'tack-blue', rotate: -0.7, pinOffset: 3, pinRotate: 6, photo: JuliannaSeymourPhoto },
  { type: 'review', quote: 'The email tracking changed everything. I knew exactly when to follow up instead of guessing.', name: 'Louis Faillace', role: 'Incoming Sales & Trading Analyst, Deutsche Bank', tack: 'tack-green', rotate: 1.3, pinOffset: -3, pinRotate: -7, photo: LouisFaillacePhoto },
];

const visibleCount = 3;

export default function BulletinBoard() {
  const [expanded, setExpanded] = useState(false);

  const visibleNotes = notes.slice(0, visibleCount);
  const hiddenNotes = notes.slice(visibleCount);

  const renderNote = (note: Note, idx: number) => (
    <div
      key={idx}
      className="bb-note"
      style={{ transform: `rotate(${note.rotate}deg)` }}
    >
      <img
        src={LandingThumbtack}
        alt=""
        aria-hidden
        className="bb-thumbtack"
        style={{
          left: `calc(50% + ${note.pinOffset}px)`,
          transform: `translateX(-50%) rotate(${note.pinRotate}deg)`,
        }}
      />
      <div className={`bb-badge ${note.type === 'landed' ? 'landed' : 'review'}`}>
        <div className="bb-badge-dot" />
        {note.type === 'landed' ? 'Offer landed' : 'Student review'}
      </div>
      <p className="bb-quote">"{note.quote}"</p>
      <div className="bb-author-row">
        {note.photo && (
          <img src={note.photo} alt={note.name} className="bb-avatar" />
        )}
        <div>
          <div className="bb-author">{note.name}</div>
          <div className="bb-role">{note.role}</div>
        </div>
      </div>
    </div>
  );

  return (
    <section className="bb-section" id="testimonials">
      {/* Hand-drawn loop arrow accent (from the Figma Misc set) sweeps
          up toward the heading on lg+. Adds a little character without
          competing with the bulletin cards. */}
      <img
        src={DoodleLoopArrow}
        alt=""
        aria-hidden
        className="bb-doodle-accent"
      />
      <h2 className="bb-heading">What people are saying</h2>
      <div className="bb-rule" />
      <p className="bb-sub">Real outreach. Real conversations. Real results.</p>

      <div className="bb-grid">
        {visibleNotes.map(renderNote)}
      </div>

      <div className={`bb-expand-wrap${expanded ? ' open' : ''}`}>
        <div className="bb-grid" style={{ paddingTop: 20 }}>
          {hiddenNotes.map((note, i) => renderNote(note, i + visibleCount))}
        </div>
      </div>

      <button
        className="bb-toggle"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? 'Show less' : `Show ${hiddenNotes.length} more`}
        <span className={`bb-toggle-arrow${expanded ? ' open' : ''}`}>▼</span>
      </button>
    </section>
  );
}
