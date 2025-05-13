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

        this.config.entities.forEach((entityObj, idx) => {
            const entityId = entityObj.id;
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
        this._selectedSpeaker = this.config.entities[firstPlayingSpeakerIndex].id;
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

        // Step buttons
        const minusBtn = document.createElement('mwc-button');
        minusBtn.innerText = '-';
        minusBtn.className = 'vol-step-btn';
        minusBtn.addEventListener('click', () => this.changeVolumeStep(-1));
        const plusBtn = document.createElement('mwc-button');
        plusBtn.innerText = '+';
        plusBtn.className = 'vol-step-btn';
        plusBtn.addEventListener('click', () => this.changeVolumeStep(1));

        const slider = document.createElement('ha-slider');
        slider.className = 'flex';
        slider.min = 0;
        slider.max = 100;
        slider.step = 1;
        slider.addEventListener('change', this.onChangeVolumeSlider.bind(this));

        // Tooltip for current volume
        const tooltip = document.createElement('div');
        tooltip.className = 'vol-tooltip';
        tooltip.style.display = 'none';
        tooltip.innerText = '0';
        volumeContainer.appendChild(tooltip);

        // Show tooltip on drag or hover
        function updateTooltipPosition() {
            const rect = slider.getBoundingClientRect();
            const percent = (slider.value - slider.min) / (slider.max - slider.min);
            const left = rect.left + percent * rect.width;
            tooltip.style.left = `${left - rect.left}px`;
        }
        slider.addEventListener('input', () => {
            tooltip.innerText = slider.value;
            tooltip.style.display = 'block';
            updateTooltipPosition();
        });
        slider.addEventListener('mousedown', () => {
            tooltip.style.display = 'block';
            updateTooltipPosition();
        });
        slider.addEventListener('touchstart', () => {
            tooltip.style.display = 'block';
            updateTooltipPosition();
        });
        slider.addEventListener('mouseup', () => {
            tooltip.style.display = 'none';
        });
        slider.addEventListener('touchend', () => {
            tooltip.style.display = 'none';
        });
        slider.addEventListener('mouseleave', () => {
            tooltip.style.display = 'none';
        });
        slider.addEventListener('mousemove', () => {
            if (tooltip.style.display === 'block') updateTooltipPosition();
        });

        const stopButton = document.createElement('ha-icon-button');
        stopButton.icon = 'hass:stop';
        stopButton.setAttribute('disabled', true);
        stopButton.addEventListener('click', this.onStop.bind(this));
        const sbIcon = document.createElement('ha-icon');
        sbIcon.icon = 'hass:stop';
        stopButton.appendChild(sbIcon);

        this._hassObservers.push(hass => {
            if (!this._selectedSpeaker) return;
            const speakerState = hass.states[this._selectedSpeaker]?.attributes || {};
            // no speaker level? then hide mute button, volume, and step buttons
            if (!speakerState.hasOwnProperty('volume_level')) {
                slider.setAttribute('hidden', true);
                minusBtn.setAttribute('hidden', true);
                plusBtn.setAttribute('hidden', true);
                stopButton.setAttribute('hidden', true);
            } else {
                slider.removeAttribute('hidden');
                minusBtn.removeAttribute('hidden');
                plusBtn.removeAttribute('hidden');
                stopButton.removeAttribute('hidden');
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
            slider.value = speakerState.volume_level ? Math.round(speakerState.volume_level * 100) : 0;
            tooltip.innerText = slider.value;
        });

        // Set default volume on speaker select
        this._hassObservers.push(hass => {
            if (!this._selectedSpeaker) return;
            const entityObj = this.config.entities.find(e => e.id === this._selectedSpeaker);
            const defaultVol = entityObj && entityObj.default_volume !== undefined ? entityObj.default_volume : 10;
            const speakerState = hass.states[this._selectedSpeaker]?.attributes || {};
            if (speakerState.volume_level === undefined) {
                slider.value = defaultVol;
                tooltip.innerText = defaultVol;
                this.setVolume(defaultVol / 100);
            }
        });

        volumeContainer.appendChild(muteButton);
        volumeContainer.appendChild(minusBtn);
        volumeContainer.appendChild(slider);
        volumeContainer.appendChild(plusBtn);
        volumeContainer.appendChild(stopButton);
        return volumeContainer;
    }

    onSpeakerSelect(entityId) {
        this._selectedSpeaker = entityId;
        this._hassObservers.forEach(listener => listener(this.hass));
    }

    onChangeVolumeSlider(e) {
        const slider = e.currentTarget;
        const volPercentage = parseFloat(slider.value);
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
        // Also turn off the player to fully shut it down
        this.hass.callService('media_player', 'turn_off', {
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
                },
                app_id: "379EE301"  // Custom Google Cast app ID - DEV
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
        return Math.max(0, this.config.entities.findIndex(entityObj => {
            return hass.states[entityObj.id] && hass.states[entityObj.id].state === 'playing';
        }));
    }

    setConfig(config) {
        if (!config.entities) {
            throw new Error('You need to define your media player entities');
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

    changeVolumeStep(step) {
        const slider = this.content.querySelector('ha-slider');
        if (!slider) return;
        let newVal = Number(slider.value) + step;
        newVal = Math.max(slider.min, Math.min(slider.max, newVal));
        slider.value = newVal;
        this.setVolume(newVal / 100);
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
        display: flex;
        align-items: center;
        gap: 8px;
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
    
    .volume .vol-step-btn {
        min-width: 32px;
        padding: 0 4px;
        margin: 0 2px;
        color: #fff !important;
        font-weight: bold !important;
        font-size: 1.3em;
        background: none;
        box-shadow: none;
    }
    .volume .vol-step-btn[raised] {
        background: var(--primary-color);
        color: var(--text-primary-color) !important;
    }
    .volume ha-icon-button {
        margin-right: 4px;
    }
    .volume ha-slider {
        margin: 0 8px;
    }
    .vol-tooltip {
        position: absolute;
        top: -28px;
        background: #222;
        color: #fff;
        padding: 2px 8px;
        border-radius: 6px;
        font-size: 1em;
        pointer-events: none;
        z-index: 10;
        transition: left 0.05s;
    }
    `;

    frag.appendChild(included);
    frag.appendChild(ownStyle);
    return frag;
}

customElements.define('jukebox-card', JukeboxCard);
