import { del } from '@vercel/blob';

function escapeHtml(text = '') {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function base64ToBlob(base64String) {
  const base64Data = base64String.split(',')[1];
  const buffer = Buffer.from(base64Data, 'base64');
  return new Blob([buffer], { type: 'image/jpeg' });
}

export async function POST(request) {
  const { TG_BOT_TOKEN, TG_CHAT_ID } = process.env;

  if (!TG_BOT_TOKEN || !TG_CHAT_ID) {
    return Response.json(
      { error: 'Не настроены переменные TG_BOT_TOKEN или TG_CHAT_ID' },
      { status: 500 }
    );
  }

  let videoUrlToDelete = null;

  try {
    const data = await request.json();
    const {
      fullName,
      email,
      apartment,
      metrics,
      selfieBase64,
      contractPage1Base64,
      contractLastPageBase64,
      videoUrl,
    } = data;

    videoUrlToDelete = videoUrl;

    const caption = [
      `🔑 <b>Новая заявка на ключ от парковки</b>`,
      ``,
      `👤 <b>ФИО:</b> ${escapeHtml(fullName)}`,
      `🏢 <b>Квартира:</b> ${escapeHtml(apartment)}`,
      `📧 <b>Email:</b> ${escapeHtml(email)}`,
      ``,
      `📐 <b>Проверка лица (отклонения):</b>`,
      `• Влево / Вправо (Yaw): ${metrics?.minYaw ?? 0}° / +${metrics?.maxYaw ?? 0}°`,
      `• Вниз / Вверх (Pitch): ${metrics?.minPitch ?? 0}° / +${metrics?.maxPitch ?? 0}°`,
    ].join('\n');

    const mediaForm = new FormData();
    mediaForm.append('chat_id', TG_CHAT_ID);
    mediaForm.append('photo_selfie', base64ToBlob(selfieBase64), 'selfie.jpg');
    mediaForm.append('photo_doc1', base64ToBlob(contractPage1Base64), 'contract_1.jpg');
    mediaForm.append('photo_doc2', base64ToBlob(contractLastPageBase64), 'contract_last.jpg');

    const mediaPayload = [
      {
        type: 'photo',
        media: 'attach://photo_selfie',
        caption,
        parse_mode: 'HTML',
      },
      {
        type: 'photo',
        media: 'attach://photo_doc1',
      },
      {
        type: 'photo',
        media: 'attach://photo_doc2',
      },
    ];

    mediaForm.append('media', JSON.stringify(mediaPayload));

    const mediaRes = await fetch(
      `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMediaGroup`,
      { method: 'POST', body: mediaForm }
    );
    const mediaResult = await mediaRes.json();

    if (!mediaResult.ok) {
      throw new Error(`Ошибка отправки фото в Telegram: ${mediaResult.description}`);
    }

    if (videoUrl) {
      const videoRes = await fetch(
        `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendVideo`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: TG_CHAT_ID,
            video: videoUrl,
            caption: `🎥 Видео проверки лица: ${escapeHtml(fullName)} (кв. ${escapeHtml(apartment)})`,
          }),
        }
      );
      const videoResult = await videoRes.json();

      if (!videoResult.ok) {
        throw new Error(`Ошибка отправки видео в Telegram: ${videoResult.description}`);
      }
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error('Ошибка в /api/submit:', error);
    return Response.json({ error: error.message }, { status: 500 });
  } finally {
    if (videoUrlToDelete) {
      try {
        await del(videoUrlToDelete);
      } catch (cleanupErr) {
        console.error('Не удалось удалить временное видео:', cleanupErr);
      }
    }
  }
}