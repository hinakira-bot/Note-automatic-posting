import { subscribe, unsubscribe, getStatus } from '@/lib/pipeline-runner.js';

/** GET /api/pipeline/stream — SSEストリーム */
export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // 現在の状態を即時送信
      const currentStatus = getStatus();
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify(currentStatus)}\n\n`)
      );

      // 進捗イベント受信時にSSEで送信
      const onUpdate = (snapshot, event) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(snapshot)}\n\n`)
          );

          // ログイベントは別イベントとしても送信
          if (event?.type === 'log') {
            controller.enqueue(
              encoder.encode(`event: log\ndata: ${JSON.stringify(event.data)}\n\n`)
            );
          }

          // 完了時
          if (event?.type === 'done') {
            controller.enqueue(
              encoder.encode(`event: done\ndata: {}\n\n`)
            );
          }
        } catch {
          // クライアントが切断された場合
          unsubscribe(onUpdate);
        }
      };

      subscribe(onUpdate);

      // クリーンアップ（ストリームが閉じられたとき）
      const checkClosed = setInterval(() => {
        try {
          // keep-alive
          controller.enqueue(encoder.encode(`: keep-alive\n\n`));
        } catch {
          clearInterval(checkClosed);
          unsubscribe(onUpdate);
        }
      }, 15000);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
