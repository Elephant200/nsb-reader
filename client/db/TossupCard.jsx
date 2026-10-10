import { stringifyTossup } from '../scripts/stringify.js';
import QuestionCard from '../scripts/components/QuestionCard.jsx';

export default function TossupCard ({ tossup, highlightedTossup, hideAnswerline, hideCardFooter, topRightComponent, fontSize = 16 }) {
  const _id = tossup._id;

  function clickToCopy () {
    const textdata = stringifyTossup(tossup);
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
      question={tossup}
      topRightComponent={topRightComponent}
    >
      <div className='card-body' style={{ fontSize: `${fontSize}px` }}>
        <span style={{ fontWeight: tossup.question.substring(0, 3) === '<b>' ? 'bold' : 'normal' }}>{tossup.number}. </span>
        <span dangerouslySetInnerHTML={{ __html: highlightedTossup.question }} />
        <hr className='my-3' />
        <div>
          <b>ANSWER:</b> <span dangerouslySetInnerHTML={{ __html: hideAnswerline ? '' : highlightedTossup?.answer }} />
        </div>
      </div>
      <div className={`card-footer d-flex justify-content-between ${hideCardFooter && 'd-none'}`}>
        <div className='flex-grow-1'>
          <small className='text-muted'>
            {tossup.packet.name ? 'Packet ' + tossup.packet.name : <span>&nbsp;</span>}
          </small>
        </div>
        <div>
          <small className='text-muted'>
            <a href={`/db/tossup/?_id=${_id}`} onClick={e => e.stopPropagation()}>
              Link to tossup
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
