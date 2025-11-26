export default async function handler(request, response) {
  if (request.method !== 'POST')
    return response.status(405).json({ error: 'Method Not Allowed' });
  const { productName, imageUrl, apiKey } = request.body;
  if (!productName || !apiKey)
    return response.status(400).json({ error: '必要な情報が不足しています' });

  try {
    let imagePart = null;
    if (imageUrl) {
      try {
        const imgRes = await fetch(imageUrl);
        const arrayBuffer = await imgRes.arrayBuffer();
        const base64Image = Buffer.from(arrayBuffer).toString('base64');
        const mimeType = imgRes.headers.get('content-type') || 'image/jpeg';
        imagePart = { inlineData: { data: base64Image, mimeType: mimeType } };
      } catch (e) {
        console.warn('画像取得失敗:', e);
      }
    }

    const systemInstruction = `
あなたは「ECの権利侵害対策のプロ（凄腕弁理士）」です。
商品名と画像を分析し、知的財産権侵害のリスクを判定してください。
【特に警戒すべき「危険信号」】
- 有名ブランドのロゴが入った偽物（商標法違反の疑い）
- アニメ・漫画のキャラクターを無断使用したグッズ（著作権法違反の疑い）
- 芸能人の写真を無断使用した商品
- 明らかに「偽ブランド品」であることを隠語（パロディ、オマージュ等）で販売しているもの
【出力フォーマット】以下のJSON形式のみ。
{ "risk_level": "高" | "中" | "低", "is_critical": true | false, "reason": "判定理由（日本語で簡潔に）" }
【判定基準】
- 高 (High): 権利侵害の疑いが濃厚。
- 中 (Medium): グレーゾーン。「〇〇風」等。
- 低 (Low): 一般的な商品。
- is_critical: 「高」の中でも特に悪質性が高い（逮捕リスクあり等）場合は true。
`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
    const contentsParts = [{ text: `商品名: ${productName}` }];
    if (imagePart) contentsParts.push(imagePart);

    const payload = {
      contents: [{ role: 'user', parts: contentsParts }],
      systemInstruction: { parts: [{ text: systemInstruction }] },
      generationConfig: { responseMimeType: 'application/json' },
    };

    const aiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) throw new Error('RateLimit');
      throw new Error(`AI API Error: ${aiRes.status}`);
    }

    const aiData = await aiRes.json();
    const text = aiData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('AIからの応答が空です');
    return response.status(200).json(JSON.parse(text));
  } catch (error) {
    if (error.message === 'RateLimit')
      return response.status(429).json({ error: 'Too Many Requests' });
    return response
      .status(500)
      .json({ risk_level: 'エラー', reason: error.message });
  }
}
