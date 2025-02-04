import React, {
  useRef,
  useState,
  useEffect,
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
} from 'react';
import {WebView} from './WebView';
import {View, StyleSheet, Platform} from 'react-native';
import {
  PLAYER_ERROR,
  PLAYER_STATES,
  DEFAULT_BASE_URL,
  CUSTOM_USER_AGENT,
} from './constants';
import {EventEmitter} from 'events';
import {
  playMode,
  soundMode,
  MAIN_SCRIPT,
  PLAYER_FUNCTIONS,
} from './PlayerScripts';

const isWeb = Platform.OS === 'web';

const isJSON = str => {
  try {
    return !!JSON.parse(str);
  } catch (error) {
    return false;
  }
};

const YoutubeIframe = (props, ref) => {
  const {
    height,
    width,
    videoId,
    playList,
    play = false,
    mute = false,
    volume = 100,
    webViewStyle,
    webViewProps,
    useLocalHTML,
    baseUrlOverride,
    playbackRate = 1,
    contentScale = 1.0,
    onError = _err => {},
    onReady = _event => {},
    playListStartIndex = 0,
    initialPlayerParams = {},
    allowWebViewZoom = false,
    onProgress = _event => {},
    forceAndroidAutoplay = false,
    onChangeState = _event => {},
    onFullScreenChange = _status => {},
    onPlaybackQualityChange = _quality => {},
    onPlaybackRateChange = _playbackRate => {},
  } = props;

  const webViewRef = useRef(null);
  const eventEmitter = useRef(new EventEmitter());
  const [playerReady, setPlayerReady] = useState(false);

  useImperativeHandle(
    ref,
    () => ({
      getVideoUrl: () => {
        webViewRef.current.injectJavaScript(PLAYER_FUNCTIONS.getVideoUrlScript);
        return new Promise(resolve => {
          eventEmitter.current.once('getVideoUrl', resolve);
        });
      },
      getDuration: () => {
        webViewRef.current.injectJavaScript(PLAYER_FUNCTIONS.durationScript);
        return new Promise(resolve => {
          eventEmitter.current.once('getDuration', resolve);
        });
      },
      getCurrentTime: () => {
        webViewRef.current.injectJavaScript(PLAYER_FUNCTIONS.currentTimeScript);
        return new Promise(resolve => {
          eventEmitter.current.once('getCurrentTime', resolve);
        });
      },
      isMuted: () => {
        webViewRef.current.injectJavaScript(PLAYER_FUNCTIONS.isMutedScript);
        return new Promise(resolve => {
          eventEmitter.current.once('isMuted', resolve);
        });
      },
      getVolume: () => {
        webViewRef.current.injectJavaScript(PLAYER_FUNCTIONS.getVolumeScript);
        return new Promise(resolve => {
          eventEmitter.current.once('getVolume', resolve);
        });
      },
      getPlaybackRate: () => {
        webViewRef.current.injectJavaScript(
          PLAYER_FUNCTIONS.getPlaybackRateScript,
        );
        return new Promise(resolve => {
          eventEmitter.current.once('getPlaybackRate', resolve);
        });
      },
      getAvailablePlaybackRates: () => {
        webViewRef.current.injectJavaScript(
          PLAYER_FUNCTIONS.getAvailablePlaybackRatesScript,
        );
        return new Promise(resolve => {
          eventEmitter.current.once('getAvailablePlaybackRates', resolve);
        });
      },
      seekTo: (seconds, allowSeekAhead) => {
        webViewRef.current.injectJavaScript(
          PLAYER_FUNCTIONS.seekToScript(seconds, allowSeekAhead),
        );
      },
    }),
    [],
  );

  useEffect(() => {
    if (!playerReady) {
      return;
    }

    if (!isWeb) {
      [
        playMode[play],
        soundMode[mute],
        PLAYER_FUNCTIONS.setVolume(volume),
        PLAYER_FUNCTIONS.setPlaybackRate(playbackRate),
      ].forEach(webViewRef.current.injectJavaScript);
    }
  }, [play, playerReady, mute, volume, playbackRate]);

  const onWebMessage = useCallback(
    event => {
      try {
        let message = {};

        if (isJSON(event?.nativeEvent?.data)) {
          message = JSON.parse(event.nativeEvent.data);
        } else {
          message = event.nativeEvent.data;
        }

        if (isJSON(message.data)) {
          message.data = JSON.parse(message.data);
        }

        switch (message.eventType) {
          case 'fullScreenChange':
            onFullScreenChange(message.data);
            break;
          case 'onPlayerProgress':
            onProgress(message.data.info);
            break;
          case 'playerStateChange':
            const state = PLAYER_STATES[message.data];
            if (state) {
              onChangeState(PLAYER_STATES[message.data]);
            }
            break;
          case 'playerReady':
            onReady();
            setPlayerReady(true);
            if (Array.isArray(playList)) {
              webViewRef.current.injectJavaScript(
                PLAYER_FUNCTIONS.loadPlaylist(
                  playList,
                  playListStartIndex,
                  play,
                ),
              );
            }
            break;
          case 'playerQualityChange':
            onPlaybackQualityChange(message.data);
            break;
          case 'playerError':
            onError(PLAYER_ERROR[message.data]);
            break;
          case 'playbackRateChange':
            onPlaybackRateChange(message.data);
            break;
          default:
            eventEmitter.current.emit(message.eventType, message.data);
            break;
        }
      } catch (error) {
        console.warn(error);
      }
    },
    [
      play,
      onReady,
      onError,
      playList,
      onProgress,
      onChangeState,
      onFullScreenChange,
      playListStartIndex,
      onPlaybackRateChange,
      onPlaybackQualityChange,
    ],
  );

  const onShouldStartLoadWithRequest = useCallback(
    request => {
      try {
        const url = request.mainDocumentURL || request.url;
        const iosFirstLoad = Platform.OS === 'ios' && url === 'about:blank';
        const shouldLoad =
          iosFirstLoad || url.startsWith(baseUrlOverride || DEFAULT_BASE_URL);
        return shouldLoad;
      } catch (error) {
        // defaults to true in case of error
        // returning false stops the video from loading
        return true;
      }
    },
    [baseUrlOverride],
  );

  const source = useMemo(() => {
    const ytScript = MAIN_SCRIPT(
      videoId,
      playList,
      initialPlayerParams,
      allowWebViewZoom,
      contentScale,
    );

    if (useLocalHTML) {
      const res = {html: ytScript.htmlString};
      if (baseUrlOverride) {
        res.baseUrl = baseUrlOverride;
      }
      return res;
    }

    const base = baseUrlOverride || DEFAULT_BASE_URL;
    const data = ytScript.urlEncodedJSON;

    return {uri: base + '?data=' + data, method: 'get'};
  }, [
    videoId,
    playList,
    useLocalHTML,
    contentScale,
    baseUrlOverride,
    allowWebViewZoom,
    initialPlayerParams,
  ]);

  return (
    <View style={{height, width}}>
      <WebView
        bounces={false}
        originWhitelist={['*']}
        allowsInlineMediaPlayback
        style={[styles.webView, webViewStyle]}
        mediaPlaybackRequiresUserAction={false}
        onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
        allowsFullscreenVideo={!initialPlayerParams?.preventFullScreen}
        userAgent={
          forceAndroidAutoplay
            ? Platform.select({android: CUSTOM_USER_AGENT, ios: ''})
            : ''
        }
        // props above this are override-able

        // --
        {...webViewProps}
        // --

        //add props that should not be allowed to be overridden below
        source={source}
        ref={webViewRef}
        onMessage={onWebMessage}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  webView: {backgroundColor: 'transparent'},
});

export default forwardRef(YoutubeIframe);
