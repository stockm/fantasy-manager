// Accuracy layer for market-data labels and provenance.
// The market feed is 14-team half-PPR ADP; it is not Yahoo's private ADP feed.

const baseMarketMerge = mergeMarketData;
mergeMarketData = function mergeMarketDataWithProvenance(data) {
  const result = baseMarketMerge(data);
  state.players.forEach(player => {
    if (num(player.marketAdp) !== null) {
      player.adpSource = 'Fantasy Football Calculator · 14-team half-PPR';
      player.yahooAdp = null;
    }
    if (num(player.projection) !== null && player.projectionSource !== 'Manual override') {
      if (player.projectionQuality === 'consensus-custom-yahoo') {
        player.projectionSource = 'FantasyPros consensus anchor · custom Yahoo scoring';
      } else if (player.projectionQuality === 'consensus-approx') {
        player.projectionSource = 'FantasyPros consensus anchor · approximate scoring';
      } else if (player.projectionQuality === 'adp-calibrated-estimate') {
        player.projectionSource = '14-team ADP-calibrated season estimate';
      }
    }
  });
  state.feed.marketProvider = '14-team half-PPR market ADP + 2026 season projections';
  state.feed.marketAnchorCount = Number(data.projectionAnchorCount || 0);
  state.feed.marketEstimateCount = Number(data.projectionEstimateCount || 0);
  saveState();
  return result;
};

const baseMarketReason = recommendationReason;
recommendationReason = function accurateMarketRecommendationReason(player, targetPick) {
  return baseMarketReason(player, targetPick)
    .replace(/Yahoo ADP/g, '14-team ADP')
    .replace(/market ADP/g, '14-team ADP');
};

const baseMarketFeedMeta = renderMarketFeedMeta;
renderMarketFeedMeta = function accurateMarketFeedMeta() {
  baseMarketFeedMeta();
  const metric = document.getElementById('feed-market-adp');
  if (metric?.previousElementSibling) metric.previousElementSibling.textContent = '14-team ADP';
  const pill = document.getElementById('live-source-pill');
  if (pill && state.feed.marketGeneratedAt) pill.textContent = 'ECR + 14-team ADP + projections';
  const detail = document.getElementById('dashboard-feed-detail');
  if (detail && state.feed.marketGeneratedAt) {
    const anchors = Number(state.feed.marketAnchorCount || 0);
    const estimates = Number(state.feed.marketEstimateCount || 0);
    const date = state.feed.marketProjectionDate || state.feed.scrapeDate || '';
    detail.textContent = `${state.feed.marketAdpCount || 0} 14-team ADP values · ${anchors} consensus anchors · ${estimates} calibrated estimates${date ? ` · ${date}` : ''}`;
  }
  const banner = document.getElementById('draft-data-banner');
  const bannerText = banner?.querySelector('span:nth-child(2)');
  if (bannerText && state.feed.marketGeneratedAt) bannerText.textContent = 'ECR + 14-team half-PPR ADP + season projections';
  const reload = document.getElementById('refresh-market-data');
  if (reload) reload.textContent = 'Reload ADP + projections';
};

renderMarketFeedMeta();
