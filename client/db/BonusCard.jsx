import { stringifyBonus } from '../scripts/stringify.js';
import getBonusPartLabel from '../scripts/utilities/get-bonus-part-label.js';
import QuestionCard from '../scripts/components/QuestionCard.jsx';

export default function BonusCard ({ bonus, highlightedBonus, hideAnswerlines, hideCardFooter, topRightComponent, fontSize = 16 }) {
  const _id = bonus._id;
  const bonusLength = bonus.parts.length;
  const indices = [];

  for (let i = 0; i < bonusLength; i++) {
    indices.push(i);
  }

  function clickToCopy () {
    const textdata = stringifyBonus(bonus);
    navigator.clipboard.writeText(textdata);
    const toast = new bootstrap.Toast(document.getElementById('clipboard-toast'));
    toast.show();
  }

  function onClickFooter () {
    document.getElementById('report-question-id').value = _id;
  }

  return (
    <QuestionCard
      onClickHeader={clickToCopy}
      question={bonus}
      topRightComponent={topRightComponent}
    >
      <div className='card-body' style={{ fontSize: `${fontSize}px` }}>
        <span style={{ fontWeight: bonus.leadin.substring(0, 3) === '<b>' ? 'bold' : 'normal' }}>{bonus.number}. </span>
        <span dangerouslySetInnerHTML={{ __html: highlightedBonus.leadin }} />
        {indices.map((i) =>
          <div key={`${bonus._id}-${i}`}>
            <hr />
            <p>{getBonusPartLabel(bonus, i)} <span dangerouslySetInnerHTML={{ __html: highlightedBonus.parts[i] }} /></p>
            <b>ANSWER: </b>
            <span dangerouslySetInnerHTML={{ __html: hideAnswerlines ? '' : highlightedBonus?.answers[i] }} />
          </div>
        )}
      </div>
      <div className={`card-footer d-flex justify-content-between ${hideCardFooter && 'd-none'}`}>
        <div className='flex-grow-1'>
          <small className='text-muted'>
            {bonus.packet.name ? 'Packet ' + bonus.packet.name : <span>&nbsp;</span>}
          </small>
        </div>
        <div>
          <small className='text-muted'>
            <a href={`/db/bonus/?_id=${_id}`} onClick={e => e.stopPropagation()}>
              Link to bonus
            </a>
            <span> | </span>
            <a href='#' onClick={onClickFooter} id={`report-question-${_id}`} data-bs-toggle='modal' data-bs-target='#report-question-modal'>
              Report Question
            </a>
          </small>
        </div>
      </div>
    </QuestionCard>
  );
}
