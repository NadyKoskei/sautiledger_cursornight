import { AssistantChat } from '../components/AssistantChat.jsx';
import { ScreenHeader } from '../components/Screen.jsx';

export default function Assistant() {
  return (
    <>
      <ScreenHeader title="Ask SautiLedger" subtitle="Answers come from your own numbers" />
      <div className="mx-auto h-[calc(100dvh-9.5rem)] max-w-md px-5 pb-2 pt-4">
        <AssistantChat className="h-full" />
      </div>
    </>
  );
}
