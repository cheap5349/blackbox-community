// jsdom 没有实现媒体播放：不 stub 的话，凡是挂载到音频组件的用例都会打印一遍
// "Not implemented: HTMLMediaElement's play() method"，把真正的失败信息淹掉。
// 这里只补最小的播放/暂停语义，音频状态的详细行为由 useBgm.test.js 的 FakeAudio 覆盖。
if (typeof HTMLMediaElement !== 'undefined') {
  HTMLMediaElement.prototype.play = function play() {
    this.paused = false
    return Promise.resolve()
  }

  HTMLMediaElement.prototype.pause = function pause() {
    this.paused = true
  }
}
