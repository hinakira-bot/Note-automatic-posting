import { getNextKeyword, getKeywordById, markAsPosted, markAsFailed } from './keyword-manager.js';
import { analyzeCompetitors, searchLatestNews } from './competitor-analyzer.js';
import { generateArticle } from './content-generator.js';
import { generateAllImages } from './image-generator.js';
import { postToNote } from './note-poster.js';
import { logPost } from './post-logger.js';
import { loadAllKnowledge } from './knowledge-manager.js';
import config from './config.js';
import logger from './logger.js';

/**
 * 1記事分の投稿パイプライン
 *
 * キーワード取得 → ナレッジ読込 → モード判定 → 競合分析 → 記事生成 → 画像生成 → Note投稿
 *
 * @param {Object} options
 * @param {boolean} [options.dryRun] - ドライランモード
 * @param {string} [options.keyword] - 特定キーワードを指定（キーワード文字列）
 * @param {string} [options.keywordId] - 特定キーワードをIDで指定
 * @param {Function} [options.onProgress] - 進捗コールバック ({step, message, progress, keyword, title})
 */
export async function runPipeline(options = {}) {
  const startTime = Date.now();
  const dryRun = options.dryRun ?? config.dryRun;
  const onProgress = options.onProgress;

  try {
    // === STEP 0: キーワード取得 ===
    onProgress?.({ step: 'keyword', message: 'キーワード取得中...', progress: 0 });
    logger.info('========================================');
    logger.info('  Note 自動投稿パイプライン開始');
    logger.info('========================================');

    let keywordData;
    if (options.keywordId) {
      // IDで特定のキーワードを指定
      keywordData = getKeywordById(options.keywordId);
      if (!keywordData) {
        logger.warn(`指定されたキーワードが見つかりません: ${options.keywordId}`);
        return { success: false, reason: 'keyword_not_found' };
      }
      logger.info(`指定キーワードで実行: "${keywordData.keyword || keywordData.description?.slice(0, 30)}"`);
    } else {
      keywordData = getNextKeyword();
    }
    if (!keywordData) {
      logger.warn('未投稿キーワードがありません。終了します。');
      return { success: false, reason: 'no_keywords' };
    }

    const keyword = keywordData.keyword || '';
    const description = keywordData.description || '';

    // モード判定
    const mode = keyword && description ? 'both'
      : keyword ? 'keyword-only'
      : 'description-only';

    const displayLabel = keyword || description.slice(0, 40);
    logger.info(`対象: "${displayLabel}"`);
    logger.info(`モード: ${mode}`);
    if (description) logger.info(`説明: "${description.slice(0, 60)}..."`);

    onProgress?.({ step: 'keyword', message: `対象: "${displayLabel}"`, progress: 5, keyword: displayLabel });

    // === STEP 0.5: ナレッジ読み込み ===
    onProgress?.({ step: 'knowledge', message: 'ナレッジ読み込み中...', progress: 10 });
    logger.info('--- ナレッジ読み込み ---');
    const knowledge = await loadAllKnowledge();
    if (knowledge) {
      logger.info(`ナレッジ: ${knowledge.length}文字 読み込み済み`);
      onProgress?.({ message: `ナレッジ: ${knowledge.length}文字 読み込み済み` });
    } else {
      logger.info('ナレッジ: なし');
    }

    // === STEP 1: 競合分析 ===
    let analysisData = null;
    if (keyword) {
      onProgress?.({ step: 'analysis', message: '競合分析中...', progress: 15 });
      logger.info('--- STEP 1: 競合分析 ---');
      analysisData = await analyzeCompetitors(keyword);
      onProgress?.({ message: '競合分析完了', progress: 30 });
    } else {
      logger.info('--- STEP 1: 競合分析スキップ (説明のみモード) ---');
      onProgress?.({ step: 'analysis', message: '競合分析スキップ (説明のみモード)', progress: 30 });
      analysisData = {
        keyword: '',
        searchResults: [],
        articles: [],
        summary: {
          keyword: '',
          totalArticles: 0,
          avgCharCount: 0,
          commonH2Count: 0,
          searchIntent: 'informational',
          commonTopics: [],
          topHeadings: [],
        },
      };
    }

    // === STEP 1.5: 最新情報検索 ===
    let latestNews = null;
    if (keyword) {
      onProgress?.({ step: 'analysis', message: '最新情報を検索中...', progress: 28 });
      logger.info('--- STEP 1.5: 最新情報検索 ---');
      latestNews = await searchLatestNews(keyword);
      const newsCount = latestNews?.latestNews?.length || 0;
      logger.info(`最新情報: ${newsCount}件取得`);
      onProgress?.({ message: `最新情報: ${newsCount}件取得`, progress: 32 });
    }

    // === STEP 2: 記事生成（description + knowledge + latestNews を渡す） ===
    onProgress?.({ step: 'content', message: '記事生成中...', progress: 35 });
    logger.info('--- STEP 2: 記事生成 ---');
    const article = await generateArticle(keyword, analysisData, {
      description,
      knowledge,
      latestNews,
      mode,
    });
    onProgress?.({ message: `記事生成完了: ${article.title}`, progress: 60, title: article.title });

    // === STEP 3: 画像生成 ===
    onProgress?.({ step: 'image', message: '画像生成中...', progress: 65 });
    logger.info('--- STEP 3: 画像生成 ---');
    const imageFiles = await generateAllImages(article);
    onProgress?.({ message: '画像生成完了', progress: 80 });

    // === STEP 4: 投稿 ===
    onProgress?.({ step: 'posting', message: 'Note投稿中...', progress: 85 });
    logger.info('--- STEP 4: Note投稿 ---');
    let postResult;

    if (dryRun) {
      logger.info('[ドライラン] 投稿をスキップします');
      logger.info(`タイトル: ${article.title}`);
      logger.info(`見出し数: ${article.outline.length}`);
      logger.info(`本文長: ${article.bodyHtml.length}文字`);
      logger.info(`アイキャッチ: ${imageFiles.eyecatchPath || 'なし'}`);
      logger.info(
        `図解: ${imageFiles.diagrams.filter((d) => d.imagePath).length}枚`
      );
      postResult = { success: true, dryRun: true };
      onProgress?.({ message: '[ドライラン] 投稿スキップ', progress: 95 });
    } else {
      postResult = await postToNote(article, imageFiles);
      if (postResult.success) {
        onProgress?.({ message: '投稿完了', progress: 95 });
      } else {
        onProgress?.({ message: `投稿エラー: ${postResult.error || '不明'}`, progress: 95 });
      }
    }

    // === STEP 5: ステータス更新 ===
    const elapsed = Math.round((Date.now() - startTime) / 1000);

    if (postResult.success) {
      markAsPosted(keyword || keywordData.id, postResult.url || '');
      logPost({
        keyword: keyword || description.slice(0, 40),
        title: article.title,
        url: postResult.url || '',
        dryRun,
        elapsedSeconds: elapsed,
        imageCount: imageFiles.diagrams.filter((d) => d.imagePath).length + (imageFiles.eyecatchPath ? 1 : 0),
      });

      logger.info('========================================');
      logger.info(`  投稿完了! (${elapsed}秒)`);
      logger.info(`  タイトル: ${article.title}`);
      logger.info('========================================');
    } else {
      markAsFailed(keyword || keywordData.id, postResult.error || '不明なエラー');
      logPost({
        keyword: keyword || description.slice(0, 40),
        title: article.title,
        error: postResult.error,
        success: false,
        elapsedSeconds: elapsed,
      });
    }

    if (postResult.success) {
      onProgress?.({ step: 'done', message: '完了', progress: 100 });
    } else {
      onProgress?.({ step: 'error', message: `エラー: ${postResult.error || '不明'}`, progress: 95 });
    }

    return {
      success: postResult.success,
      error: postResult.error || undefined,
      keyword: keyword || description.slice(0, 40),
      title: article.title,
      elapsed,
      dryRun,
    };
  } catch (err) {
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    logger.error(`パイプラインエラー: ${err.message}`);
    logger.error(err.stack);
    onProgress?.({ step: 'error', message: `エラー: ${err.message}`, progress: 0 });

    // キーワードが取得できていた場合は失敗マーク
    try {
      const keywordData = getNextKeyword();
      if (keywordData) {
        markAsFailed(keywordData.keyword || keywordData.id, err.message);
      }
    } catch { /* ignore */ }

    return { success: false, error: err.message, elapsed };
  }
}
