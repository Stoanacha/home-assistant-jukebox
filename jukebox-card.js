class JukeboxCard extends HTMLElement {
    set hass(hass) {
        if (!this.content) {
            this._hassObservers = [];
            this.appendChild(getStyle());
            const card = document.createElement('ha-card');
            this.content = document.createElement('div');
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
        const container = document.createElement('div');
        container.className = 'speaker-switches';
        this._speakerButtons = [];

        this.config.entities.forEach((entityId, idx) => {
            if (!hass.states[entityId]) return;
            const name = hass.states[entityId].attributes.friendly_name || entityId;
            const btn = document.createElement('mwc-button');
            btn.innerText = name;
            btn.className = 'speaker-btn';
            btn.addEventListener('click', () => {
                this.onSpeakerSelect(entityId);
                this._speakerButtons.forEach(b => b.removeAttribute('raised'));
                btn.setAttribute('raised', '');
            });
            if (!this._selectedSpeaker && idx === 0) {
                btn.setAttribute('raised', '');
            }
            this._speakerButtons.push(btn);
            container.appendChild(btn);
        });

        // Highlight the first playing speaker or the first one
        const firstPlayingSpeakerIndex = this.findFirstPlayingIndex(hass);
        this._selectedSpeaker = this.config.entities[firstPlayingSpeakerIndex];
        if (this._speakerButtons[firstPlayingSpeakerIndex]) {
            this._speakerButtons.forEach(b => b.removeAttribute('raised'));
            this._speakerButtons[firstPlayingSpeakerIndex].setAttribute('raised', '');
        }

        return container;
    }

    buildStationList() {
        this._stationButtons = [];

        const stationList = document.createElement('div');
        stationList.classList.add('station-list');

        this.config.links.forEach(linkCfg => {
            const stationButton = this.buildStationSwitch(linkCfg.name, linkCfg.url, linkCfg.logo);
            this._stationButtons.push(stationButton);
            stationList.appendChild(stationButton);
        });

        // make sure the update method is notified of a change
        this._hassObservers.push(this.updateStationSwitchStates.bind(this));

        return stationList;
    }

    buildVolumeSlider() {
        const volumeContainer = document.createElement('div');
        volumeContainer.className = 'volume center horizontal layout';

        const muteButton = document.createElement('ha-icon-button');
        muteButton.icon = 'hass:volume-high';
        muteButton.isMute = false;
        muteButton.addEventListener('click', this.onMuteUnmute.bind(this));
	const mbIcon = document.createElement('ha-icon');
	mbIcon.icon = 'hass:volume-high';
	muteButton.appendChild(mbIcon);

        const slider = document.createElement('ha-slider');
        slider.min = 0;
        slider.max = 100;
        slider.addEventListener('change', this.onChangeVolumeSlider.bind(this));
        slider.className = 'flex';

        const stopButton = document.createElement('ha-icon-button')
        stopButton.icon = 'hass:stop';
        stopButton.setAttribute('disabled', true);
        stopButton.addEventListener('click', this.onStop.bind(this));
	const sbIcon = document.createElement('ha-icon');
	sbIcon.icon = 'hass:stop';
	stopButton.appendChild(sbIcon);


        this._hassObservers.push(hass => {
            if (!this._selectedSpeaker || !hass.states[this._selectedSpeaker]) {
                return;
            }
            const speakerState = hass.states[this._selectedSpeaker].attributes;

            // no speaker level? then hide mute button and volume
            if (!speakerState.hasOwnProperty('volume_level')) {
                slider.setAttribute('hidden', true);
                stopButton.setAttribute('hidden', true)
            } else {
                slider.removeAttribute('hidden');
                stopButton.removeAttribute('hidden')
            }

            if (!speakerState.hasOwnProperty('is_volume_muted')) {
                muteButton.setAttribute('hidden', true);
            } else {
                muteButton.removeAttribute('hidden');
            }

            if (hass.states[this._selectedSpeaker].state === 'playing') {
                stopButton.removeAttribute('disabled');
            } else {
                stopButton.setAttribute('disabled', true);
            }

            slider.value = speakerState.volume_level ? speakerState.volume_level * 100 : 0;

            if (speakerState.is_volume_muted && !slider.disabled) {
                slider.disabled = true;
                muteButton.icon = 'hass:volume-off';
                muteButton.isMute = true;
            } else if (!speakerState.is_volume_muted && slider.disabled) {
                slider.disabled = false;
                muteButton.icon = 'hass:volume-high';
                muteButton.isMute = false;
            }
        });

        volumeContainer.appendChild(muteButton);
        volumeContainer.appendChild(slider);
        volumeContainer.appendChild(stopButton);
        return volumeContainer;
    }

    onSpeakerSelect(entityId) {
        this._selectedSpeaker = entityId;
        this._hassObservers.forEach(listener => listener(this.hass));
    }

    onChangeVolumeSlider(e) {
        const volPercentage = parseFloat(e.currentTarget.value);
        const vol = (volPercentage > 0 ? volPercentage / 100 : 0);
        this.setVolume(vol);
    }

    onMuteUnmute(e) {
        this.hass.callService('media_player', 'volume_mute', {
            entity_id: this._selectedSpeaker,
            is_volume_muted: !e.currentTarget.isMute
        });
    }

    onStop(e) {
        this.hass.callService('media_player', 'media_stop', {
            entity_id: this._selectedSpeaker
        });
    }

    updateStationSwitchStates(hass) {
        let playingUrl = null;
        const selectedSpeaker = this._selectedSpeaker;

        if (hass.states[selectedSpeaker] && hass.states[selectedSpeaker].state === 'playing') {
            playingUrl = hass.states[selectedSpeaker].attributes.media_content_id;
        }

        this._stationButtons.forEach(stationSwitch => {
            if (stationSwitch.hasAttribute('raised') && stationSwitch.stationUrl !== playingUrl) {
                stationSwitch.removeAttribute('raised');
                return;
            }
            if (!stationSwitch.hasAttribute('raised') && stationSwitch.stationUrl === playingUrl) {
                stationSwitch.setAttribute('raised', true);
            }
        })
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
            img.style.verticalAlign = 'middle';
            img.style.marginRight = '8px';
            btn.appendChild(img);
        }
        // Add station name
        const span = document.createElement('span');
        span.innerText = name;
        btn.appendChild(span);
        btn.addEventListener('click', this.onStationSelect.bind(this));
        return btn;
    }

    onStationSelect(e) {
        // Support logo/metadata for play_media
        const logo = e.currentTarget.stationLogo;
        const name = e.currentTarget.stationName;
        const data = {
            entity_id: this._selectedSpeaker,
            media_content_id: e.currentTarget.stationUrl,
            media_content_type: 'audio/mp4',
            extra: {
                metadata: {
                    metadataType: 3,
                    title: name,
                    artist: "Live Radio",
                    images: [
                        { url: logo }
                    ]
                }
            }
        };
        this.hass.callService('media_player', 'play_media', data);
    }

    setVolume(value) {
        this.hass.callService('media_player', 'volume_set', {
            entity_id: this._selectedSpeaker,
            volume_level: value
        });
    }

    /***
     * returns the numeric index of the first entity in a "Playing" state, or 0 (first index).
     *
     * @param hass
     * @returns {number}
     * @private
     */
    findFirstPlayingIndex(hass) {
        return Math.max(0, this.config.entities.findIndex(entityId => {
            return hass.states[entityId] && hass.states[entityId].state === 'playing';
        }));
    }

    setConfig(config) {
        if (!config.entities) {
            throw new Error('You need to define your media player entities');
        }
        this.config = config;
    }

    getCardSize() {
        return 3;
    }
}

function getStyle() {
    const frag = document.createDocumentFragment();

    const included = document.createElement('style');
    included.setAttribute('include', 'iron-flex iron-flex-alignment');

    const ownStyle = document.createElement('style');
    ownStyle.innerHTML = `
    .layout.horizontal, .layout.vertical {
        display: -ms-flexbox;
        display: -webkit-flex;
        display: flex;
    }
    
    .layout.horizontal {
        -ms-flex-direction: row;
        -webkit-flex-direction: row;
        flex-direction: row;
    }
    
    .layout.center, .layout.center-center {
        -ms-flex-align: center;
        -webkit-align-items: center;
        align-items: center;
    }
    
    .flex {
        ms-flex: 1 1 0.000000001px;
        -webkit-flex: 1;
        flex: 1;
        -webkit-flex-basis: 0.000000001px;
        flex-basis: 0.000000001px;
    }
    
    [hidden] {
        display: none !important;
    }
    
    .volume {
        padding: 10px 20px;
    }
    
    mwc-button.juke-toggle {
        --mdc-theme-primary: var(--primary-text-color);
    }
    
    mwc-button.juke-toggle[raised] {
        --mdc-theme-primary: var(--primary-color);
        background-color: var(--primary-color);
        color: var(--text-primary-color);
    }
    
    paper-tabs {
        background-color: var(--primary-color);
        color: var(--text-primary-color);
        --paper-tabs-selection-bar-color: var(--text-primary-color, #FFF);
    }
            
    .speaker-switches {
        margin: 10px;
    }
    
    .speaker-btn {
        margin: 0 4px 0 0;
        padding: 0 8px;
        min-width: 0;
    }
            
    mwc-button.juke-toggle img {
        border-radius: 3px;
        background: #222;
    }
    
    `;

    frag.appendChild(included);
    frag.appendChild(ownStyle);
    return frag;
}

customElements.define('jukebox-card', JukeboxCard);
