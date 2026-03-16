import { type FC } from 'react';
import { type ChatMessageMessagePart } from '@ironclad/rivet-core';
import { P, match } from 'ts-pattern';
import prettyBytes from 'pretty-bytes';

export const RenderChatMessagePart: FC<{
  part: ChatMessageMessagePart;
  renderString: (value: string) => JSX.Element;
}> = ({ part, renderString }) => {
  return match(part)
    .with(P.string, (stringPart) => renderString(stringPart))
    .with({ type: 'image' }, (imagePart) => {
      const blob = new Blob([imagePart.data], { type: imagePart.mediaType });
      const imageUrl = URL.createObjectURL(blob);

      return (
        <div>
          <img src={imageUrl} alt="" />
        </div>
      );
    })
    .with({ type: 'url' }, (urlPart) => {
      return <img className="chat-message-url-image" src={urlPart.url} alt={urlPart.url} />;
    })
    .with({ type: 'document' }, (documentPart) => {
      const { data, mediaType, context, title, enableCitations } = documentPart;

      return (
        <div>
          <p>
            {title ? `Document: ${title}` : 'Document'} ({mediaType})
          </p>
          {context && <p>{context}</p>}
          {enableCitations && <p>(Citations enabled)</p>}
          Size: {data.length > 0 ? prettyBytes(data.length) : '0 bytes'}
        </div>
      );
    })
    .exhaustive();
};
