import { NextResponse } from 'next/server';
import { readFileSync, writeFileSync, readdirSync, mkdirSync, unlinkSync, existsSync } from 'fs';
import { resolve, extname } from 'path';
import config from '@/config.js';

const REF_IMAGES_DIR = resolve(config.paths.data, 'reference-images');

/** GET /api/reference-images — 参照画像一覧 */
export async function GET() {
  try {
    mkdirSync(REF_IMAGES_DIR, { recursive: true });

    const files = readdirSync(REF_IMAGES_DIR).filter((f) =>
      /\.(png|jpg|jpeg|webp|gif)$/i.test(f)
    );

    const images = files.map((filename) => {
      const filePath = resolve(REF_IMAGES_DIR, filename);
      const data = readFileSync(filePath);
      const ext = extname(filename).toLowerCase().replace('.', '');
      const mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;

      return {
        filename,
        // 画像タイプ判定（ファイル名にeyecatchが含まれればアイキャッチ用）
        type: filename.toLowerCase().includes('eyecatch') ? 'eyecatch' : 'diagram',
        size: data.length,
        base64: data.toString('base64'),
        mimeType,
      };
    });

    return NextResponse.json({ images });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/** POST /api/reference-images — 参照画像アップロード */
export async function POST(request) {
  try {
    mkdirSync(REF_IMAGES_DIR, { recursive: true });

    const formData = await request.formData();
    const file = formData.get('file');
    const imageType = formData.get('type') || 'diagram'; // 'eyecatch' or 'diagram'

    if (!file) {
      return NextResponse.json(
        { error: 'ファイルが選択されていません' },
        { status: 400 }
      );
    }

    // サイズチェック（5MB上限）
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'ファイルサイズは5MB以下にしてください' },
        { status: 400 }
      );
    }

    // 拡張子チェック
    const ext = extname(file.name).toLowerCase();
    if (!['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext)) {
      return NextResponse.json(
        { error: '対応形式: PNG, JPG, WEBP, GIF' },
        { status: 400 }
      );
    }

    // ファイル名生成（タイプ + タイムスタンプ）
    const timestamp = Date.now();
    const filename = `${imageType}-${timestamp}${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    writeFileSync(resolve(REF_IMAGES_DIR, filename), buffer);

    return NextResponse.json({
      ok: true,
      filename,
      message: `参照画像をアップロードしました: ${filename}`,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/** DELETE /api/reference-images — 参照画像削除 */
export async function DELETE(request) {
  try {
    const { filename } = await request.json();

    if (!filename) {
      return NextResponse.json(
        { error: 'ファイル名を指定してください' },
        { status: 400 }
      );
    }

    // パストラバーサル防止
    if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
      return NextResponse.json(
        { error: '不正なファイル名です' },
        { status: 400 }
      );
    }

    const filePath = resolve(REF_IMAGES_DIR, filename);
    if (!existsSync(filePath)) {
      return NextResponse.json(
        { error: 'ファイルが見つかりません' },
        { status: 404 }
      );
    }

    unlinkSync(filePath);
    return NextResponse.json({ ok: true, message: `${filename} を削除しました` });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
