// Light/dark choice for the page. Loaded in <head>, so data-scheme is set before the first paint.
// Without JavaScript the page follows the system scheme (see the media query in site.css).
(function () {
  var KEY = 'breccia-site-scheme'
  var root = document.documentElement

  function read() {
    try {
      var v = window.localStorage.getItem(KEY)
      return v === 'light' || v === 'dark' ? v : null
    } catch (e) {
      return null
    }
  }

  function write(v) {
    try {
      window.localStorage.setItem(KEY, v)
    } catch (e) {
      // blocked storage: the choice only lasts for this visit
    }
  }

  function systemLight() {
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches)
  }

  var stored = read()
  if (stored) root.setAttribute('data-scheme', stored)

  document.addEventListener('DOMContentLoaded', function () {
    var button = document.querySelector('button.scheme')
    if (!button) return
    function isLight() {
      var s = root.getAttribute('data-scheme')
      return s ? s === 'light' : systemLight()
    }
    function show() {
      button.setAttribute('aria-pressed', isLight() ? 'true' : 'false')
    }
    button.addEventListener('click', function () {
      var next = isLight() ? 'dark' : 'light'
      root.setAttribute('data-scheme', next)
      write(next)
      show()
    })
    show()
    button.hidden = false
  })
})()
