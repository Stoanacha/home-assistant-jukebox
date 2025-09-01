class JukeboxCard extends HTMLElement {
  constructor() {
    super();
    this._hassObservers = [];
    this.content = null;
    this._selectedSpeaker = null;
    this._stationButtons = [];
    this._tabs = null;
    this._powerButton = null;
    this._powerIcon = null;
    this._muteButton = null;
    this._muteIcon = null;
    this._slider = null;
    this._stopButton = null;
    this._stopIcon = null;
    this._volumeDecreaseBtn = null;
    this._volumeIncreaseBtn = null;
    this._volumeDisplay = null;
    this.config = {};
  }

  set hass(hass) {
    if (!this.content) {
      this._hassObservers = [];
      this.appendChild(this.getStyle());
      const card = document.createElement('ha-card');
      this.content = document.createElement('div');
      this.content.className = 'content';
      card.appendChild(this.content);
      this.appendChild(card);

      this.content.appendChild(this.buildSpeakerSwitches(hass));
      this.content.appendChild(this.buildVolumeSlider());
      this.content.appendChild(this.buildStationList());
    }

    this._hass = hass;
    this._hassObservers.forEach(listener => listener(hass));
  }

  get hass() {
    return this._hass;
  }

  buildSpeakerSwitches(hass) {
    this._tabs = document.createElement('div');
    this._tabs.classList.add('tabs-container');
    
    this.config.entities.forEach((entityObj, idx) => {
      const entityId = typeof entityObj === 'string' ? entityObj : entityObj.id;
      if (!hass.states[entityId]) {
        console.log('Jukebox: No State for entity', entityId);
        return;
      }
      this._tabs.appendChild(this.buildSpeakerSwitch(entityId, hass));
    });

    const firstPlayingSpeakerIndex = this.findFirstPlayingIndex(hass);
    this._selectedSpeaker = this.getEntityId(this.config.entities[firstPlayingSpeakerIndex]);
    if (this._tabs.children[firstPlayingSpeakerIndex]) {
      this._tabs.children[firstPlayingSpeakerIndex].classList.add('active');
    }

    return this._tabs;
  }

  buildStationList() {
    this._stationButtons = [];
    const stationListContainer = document.createElement('div');
    stationListContainer.className = 'station-list-container';
    
    // Header mit Radio-Icon
    const header = document.createElement('div');
    header.className = 'station-list-header';
    header.innerHTML = '<ha-icon icon="mdi:radio"></ha-icon><span>Radio Stations</span>';
    stationListContainer.appendChild(header);
    
    // Stationsliste immer sichtbar
    const gridContainer = document.createElement('div');
    gridContainer.className = 'stations-grid';
    stationListContainer.appendChild(gridContainer);
    
    this.config.links.forEach(linkCfg => {
      const stationButton = this.buildStationSwitch(linkCfg.name, linkCfg.url, linkCfg.logo);
      this._stationButtons.push(stationButton);
      gridContainer.appendChild(stationButton);
    });
    
    this._hassObservers.push(this.updateStationButtonsState.bind(this));
    return stationListContainer;
  }

  buildVolumeSlider() {
    const volumeContainer = document.createElement('div');
    volumeContainer.className = 'volume-container';

    this._powerButton = document.createElement('ha-icon-button');
    this._powerIcon = document.createElement('ha-icon');
    this._powerIcon.icon = 'mdi:power';
    this._powerButton.appendChild(this._powerIcon);
    this._powerButton.addEventListener('click', () => this.togglePower());

    this._volumeDecreaseBtn = document.createElement('ha-icon-button');
    const decreaseIcon = document.createElement('ha-icon');
    decreaseIcon.icon = 'mdi:volume-minus';
    this._volumeDecreaseBtn.appendChild(decreaseIcon);
    this._volumeDecreaseBtn.addEventListener('click', () => this.adjustVolume(-1));

    this._slider = document.createElement('ha-slider');
    this._slider.min = 1;
    this._slider.max = 100;
    this._slider.addEventListener('change', (e) => this.onVolumeSliderChange(e));
    this._slider.className = 'volume-slider';

    this._volumeIncreaseBtn = document.createElement('ha-icon-button');
    const increaseIcon = document.createElement('ha-icon');
    increaseIcon.icon = 'mdi:volume-plus';
    this._volumeIncreaseBtn.appendChild(increaseIcon);
    this._volumeIncreaseBtn.addEventListener('click', () => this.adjustVolume(1));

    this._volumeDisplay = document.createElement('div');
    this._volumeDisplay.className = 'volume-display';
    this._volumeDisplay.textContent = '0%';

    this._muteButton = document.createElement('ha-icon-button');
    this._muteIcon = document.createElement('ha-icon');
    this._muteIcon.icon = 'mdi:volume-high';
    this._muteButton.appendChild(this._muteIcon);
    this._muteButton.isMute = false;
    this._muteButton.addEventListener('click', () => this.onMuteUnmute());

    this._stopButton = document.createElement('ha-icon-button');
    this._stopIcon = document.createElement('ha-icon');
    this._stopIcon.icon = 'mdi:stop';
    this._stopButton.appendChild(this._stopIcon);
    this._stopButton.setAttribute('disabled', true);
    this._stopButton.addEventListener('click', () => this.onStop());

    volumeContainer.appendChild(this._powerButton);
    volumeContainer.appendChild(this._muteButton);
    volumeContainer.appendChild(this._volumeDecreaseBtn);
    volumeContainer.appendChild(this._slider);
    volumeContainer.appendChild(this._volumeIncreaseBtn);
    volumeContainer.appendChild(this._volumeDisplay);
    volumeContainer.appendChild(this._stopButton);

    this._hassObservers.push(hass => this.updateControls(hass));

    return volumeContainer;
  }

  adjustVolume(change) {
    if (!this._selectedSpeaker) return;
    
    const currentVolume = this._slider.value || 0;
    let newVolume = parseInt(currentVolume) + change;
    newVolume = Math.max(1, Math.min(100, newVolume));
    
    this._slider.value = newVolume;
    this.setVolume(newVolume / 100);
    this._volumeDisplay.textContent = `${newVolume}%`;
  }

  updateControls(hass) {
    if (!this._selectedSpeaker || !hass.states[this._selectedSpeaker]) return;

    const state = hass.states[this._selectedSpeaker];
    const attrs = state.attributes;

    const isOn = state.state !== 'off' && state.state !== 'unavailable' && state.state !== 'unknown';
    this._powerButton.toggleAttribute('active', isOn);
    this._powerIcon.icon = isOn ? 'mdi:power' : 'mdi:power';

    const hasVolume = 'volume_level' in attrs;
    this._slider.toggleAttribute('hidden', !hasVolume);
    this._volumeDecreaseBtn.toggleAttribute('hidden', !hasVolume);
    this._volumeIncreaseBtn.toggleAttribute('hidden', !hasVolume);
    this._volumeDisplay.toggleAttribute('hidden', !hasVolume);
    this._stopButton.toggleAttribute('hidden', !hasVolume);
    this._muteButton.toggleAttribute('hidden', !('is_volume_muted' in attrs));

    this._stopButton.disabled = state.state !== 'playing';
    
    if (hasVolume) {
      const volumePercent = Math.round(attrs.volume_level * 100);
      this._slider.value = volumePercent;
      this._volumeDisplay.textContent = `${volumePercent}%`;
    }

    const isMuted = attrs.is_volume_muted;
    this._muteIcon.icon = isMuted ? 'mdi:volume-off' : 'mdi:volume-high';
    this._muteButton.isMute = isMuted;
    this._slider.disabled = isMuted;
  }

  onVolumeSliderChange(e) {
    const volPercentage = parseFloat(e.currentTarget.value);
    this.setVolume(volPercentage / 100);
    this._volumeDisplay.textContent = `${volPercentage}%`;
  }

  togglePower() {
    const state = this.hass.states[this._selectedSpeaker];
    if (!state) return;

    const service = state.state === 'off' ? 'turn_on' : 'turn_off';
    this.hass.callService('media_player', service, {
      entity_id: this._selectedSpeaker
    });
  }

  onSpeakerSelect(e) {
    Array.from(this._tabs.children).forEach(tab => tab.classList.remove('active'));
    e.currentTarget.classList.add('active');
    this._selectedSpeaker = e.currentTarget.entityId;
    this._hassObservers.forEach(listener => listener(this.hass));
  }

  onMuteUnmute() {
    this.hass.callService('media_player', 'volume_mute', {
      entity_id: this._selectedSpeaker,
      is_volume_muted: !this._muteButton.isMute
    });
  }

  onStop() {
    this.hass.callService('media_player', 'media_stop', {
      entity_id: this._selectedSpeaker
    });
    
    // Also turn off the player to fully shut it down
    this.hass.callService('media_player', 'turn_off', {
      entity_id: this._selectedSpeaker
    });
  }

  buildStationSwitch(name, url, logo) {
    const btn = document.createElement('mwc-button');
    btn.stationUrl = url;
    btn.stationName = name;
    btn.stationLogo = logo;
    btn.className = 'juke-toggle';
    
    // Add logo image if present
    if (logo) {
      const img = document.createElement('img');
      img.src = logo;
      img.alt = name;
      img.style.height = '20px';
      img.style.width = '20px';
      img.style.marginRight = '8px';
      img.style.verticalAlign = 'middle';
      img.style.borderRadius = '3px';
      btn.appendChild(img);
    }
    
    // Add station name
    const span = document.createElement('span');
    span.innerText = name;
    btn.appendChild(span);
    
    btn.addEventListener('click', () => {
      this._stationButtons.forEach(stationBtn => {
        stationBtn.removeAttribute('active');
        stationBtn.classList.remove('active');
      });
      btn.setAttribute('active', '');
      btn.classList.add('active');
      this.playStation(url, name, logo);
    });
    
    return btn;
  }

  updateStationButtonsState(hass) {
    let playingUrl = null;
    const selectedSpeaker = this._selectedSpeaker;

    if (hass.states[selectedSpeaker] && hass.states[selectedSpeaker].state === 'playing') {
      playingUrl = hass.states[selectedSpeaker].attributes.media_content_id;
    }

    this._stationButtons.forEach(stationBtn => {
      const isActive = stationBtn.stationUrl === playingUrl;
      stationBtn.toggleAttribute('active', isActive);
      stationBtn.classList.toggle('active', isActive);
    });
  }

  playStation(url, name, logo) {
    const data = {
      entity_id: this._selectedSpeaker,
      media_content_id: url,
      media_content_type: 'audio/mp4'
    };
    
    // Add metadata if we have a name/logo
    if (name || logo) {
      data.extra = {
        metadata: {
          metadataType: 3,
          title: name || "Radio Station",
          artist: "Live Radio",
          images: logo ? [{ url: logo }] : []
        }
      };
    }
    
    this.hass.callService('media_player', 'play_media', data);
  }

  setVolume(value) {
    this.hass.callService('media_player', 'volume_set', {
      entity_id: this._selectedSpeaker,
      volume_level: value
    });
  }

  getEntityId(entityConfig) {
    return typeof entityConfig === 'string' ? entityConfig : entityConfig.id;
  }

  findFirstPlayingIndex(hass) {
    return Math.max(0, this.config.entities.findIndex(entityObj => {
      const entityId = this.getEntityId(entityObj);
      return hass.states[entityId] && hass.states[entityId].state === 'playing';
    }));
  }

  buildSpeakerSwitch(entityId, hass) {
    const btn = document.createElement('button');
    btn.entityId = entityId;
    btn.classList.add('speaker-tab');
    btn.textContent = hass.states[entityId].attributes.friendly_name || entityId;
    
    btn.addEventListener('click', (e) => this.onSpeakerSelect(e));
    
    let longPressTimer;
    const longPressDelay = 500;
    
    btn.addEventListener('touchstart', () => {
      longPressTimer = setTimeout(() => {
        this.openSpeakerMoreInfo(entityId);
      }, longPressDelay);
    });
    
    btn.addEventListener('touchend', () => {
      clearTimeout(longPressTimer);
    });
    
    btn.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        longPressTimer = setTimeout(() => {
          this.openSpeakerMoreInfo(entityId);
        }, longPressDelay);
      }
    });
    
    btn.addEventListener('mouseup', () => {
      clearTimeout(longPressTimer);
    });
    
    btn.addEventListener('mouseleave', () => {
      clearTimeout(longPressTimer);
    });
    
    return btn;
  }

  openSpeakerMoreInfo(entityId) {
    const event = new Event('hass-more-info', {
      bubbles: true,
      composed: true
    });
    event.detail = { entityId };
    this.dispatchEvent(event);
  }

  setConfig(config) {
    if (!config.entities) {
      throw new Error('You need to define your media player entities');
    }
    if (!config.links) {
      throw new Error('You need to define your radio station links');
    }
    
    // Support both array of strings and array of objects for entities
    this.config = { ...config };
    this.config.entities = config.entities.map(e => {
      if (typeof e === 'string') {
        return { id: e };
      }
      return e;
    });
  }

  getCardSize() {
    return 3;
  }

  getStyle() {
    const style = document.createElement('style');
    style.textContent = `
      ha-card {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow: hidden;
        padding: 6px;
      }

      .content {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow: hidden;
        gap: 4px;               
      }

      .tabs-container {
        display: flex;
        flex-wrap: wrap;
        background-color: rgba(128, 128, 128, 0.1);
        color: var(--text-primary-color);
        flex-shrink: 0;
        border-radius: 4px;
      }
     
      .speaker-tab {            
        padding: 8px 12px;
        border: none;
        background: none;
        color: inherit;
        font: inherit;
        cursor: pointer;
        white-space: nowrap;
        position: relative;
        font-size: 0.9rem;
      }
      
      .speaker-tab.active {
        background-color: rgba(128, 128, 128, 0.4); 
      }
      
      .speaker-tab.active::after {
        content: '';
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 2px;
        background-color: var(--text-primary-color);
      }

      .volume-container {
        display: flex;
        align-items: center;
        padding: 8px 12px;
        gap: 4px;
        flex-shrink: 0;
      }

      .volume-slider {
        flex-grow: 1;
        margin: 0 4px;
      }

      .volume-display {
        min-width: 40px;
        text-align: center;
        font-size: 0.9em;
        color: var(--secondary-text-color);
      }

      .station-list-container {
        width: 100%;
        margin-top: 8px;
      }
      
      .station-list-header {
        display: flex;
        align-items: center;
        padding: 8px 12px;
        background-color: rgba(128,128,128, 0.4);
        border-radius: 4px;
        color: var(--primary-text-color);
        font-size: 0.9rem;
        margin-bottom: 8px;
      }

      .station-list-header ha-icon {
        margin-right: 8px;
      }

      .stations-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        padding: 8px 4px;
        width: 100%;
      }

      .juke-toggle {
        --mdc-theme-primary: var(--primary-text-color);
        --mdc-theme-on-primary: var(--primary-text-color);
        --mdc-theme-on-surface: var(--primary-text-color);
        --mdc-typography-button-font-size: 0.75rem;
        --mdc-button-horizontal-padding: 12px;
        --mdc-button-height: 32px;
        flex: 0 0 auto;
        width: auto;
        min-width: 80px;
        max-width: 200px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        transition: all 0.2s ease;
        border: 2px solid transparent;
      }

      .juke-toggle.active,
      .juke-toggle[active] {
        --mdc-theme-primary: var(--primary-color);
        --mdc-theme-on-primary: var(--text-primary-color);
        background-color: var(--primary-color) !important;
        border-color: var(--primary-color);
        transform: scale(0.98);
        box-shadow: 0 2px 8px rgba(var(--rgb-primary-color), 0.3);
      }
      
      .juke-toggle:hover {
        border-color: var(--primary-color);
        transform: translateY(-1px);
      }

      .juke-toggle:active {
        transform: scale(0.95);
      }

      .juke-toggle.active::before,
      .juke-toggle[active]::before {
        content: '▶';
        margin-right: 4px;
        font-size: 0.8em;
      }

      .juke-toggle img {
        border-radius: 3px;
        background: #222;
      }

      @media (max-width: 600px) {
        .stations-grid {
          gap: 6px;
        }
        
        .juke-toggle {
          --mdc-typography-button-font-size: 0.7rem;
          --mdc-button-height: 28px;
          --mdc-button-horizontal-padding: 8px;
          min-width: 70px;
          max-width: 150px;
        }
      }

      ha-icon-button {
        --mdc-icon-button-size: 26px;
        --mdc-icon-size: 26px;
        color: var(--secondary-text-color);
      }

      ha-icon-button[active] {
        color: var(--primary-color);
      }

      [hidden] {
        display: none !important;
      }
    `;
    return style;
  }
}

customElements.define('jukebox-card', JukeboxCard);
