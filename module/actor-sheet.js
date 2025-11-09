// module/actor-sheet.js - Dispatch RPG: actor sheet logic (robust value lookup + rolls)
export class DispatchActorSheet extends ActorSheet {
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      classes: ["dispatch", "sheet", "actor"],
      template: "systems/dispatchrpg/templates/actor-sheet.html",
      width: 920,
      height: 760,
      resizable: true
    });
  }

  getData() {
    const data = super.getData();
    // Atributos padrão
    data.data.atributos = data.data.atributos || { FOR: 0, VIG: 0, DES: 0, INT: 0, POD: 0, CAR: 0 };

    // Perícias padrão
    const defaultPericias = {
      "Atletismo": 0,
      "Condução": 0,
      "Desarmado": 0,
      "Dissimulação": 0,
      "Evasão": 0,
      "Vontade": 0,
      "Furtividade": 0,
      "Influência": 0,
      "Intuição": 0,
      "Língua Nativa": 0,
      "Malandragem": 0,
      "Musculatura": 0,
      "Ocultação": 0,
      "Pesquisa": 0,
      "Percepção": 0,
      "Primeiros Socorros": 0
    };

    data.data.pericias = data.data.pericias || {};
    for (let k of Object.keys(defaultPericias)) {
      if (data.data.pericias[k] === undefined) data.data.pericias[k] = defaultPericias[k];
    }

    data.data.pv = data.data.pv ?? 0;
    data.data.pp = data.data.pp ?? 0;
    data.data.san = data.data.san ?? 0;

    // helpers for template
    data._attrKeys = Object.keys(data.data.atributos);
    data._periciasKeys = Object.keys(data.data.pericias);

    return data;
  }

  activateListeners(html) {
    super.activateListeners(html);

    const root = this.element;

    // Upload photo
    root.on("click", ".btn-upload-photo", (ev) => this._onUploadPhoto(ev));

    // Rolls (delegated)
    root.on("click", ".roll", (ev) => this._onRollPericia(ev));
    root.on("click", ".roll-iniciativa", (ev) => this._onRollIniciativa(ev));
    root.on("click", ".roll-taxa", (ev) => this._onRollTaxaCura(ev));

    // Double click increment/decrement for skill inputs
    root.on("dblclick", ".skill-input", async (ev) => {
      const input = ev.currentTarget;
      const name = input.name;
      const match = name.match(/^data\.pericias\.(.*)$/);
      if (!match) return;
      const skillName = match[1];
      const current = Number($(input).val()) || 0;
      const delta = ev.shiftKey ? -1 : 1;
      const newVal = Math.max(0, current + delta);

      const newPericias = duplicate(this.actor?.system?.pericias || this.actor?.data?.data?.pericias || this.actor?.data?.pericias || {});
      newPericias[skillName] = newVal;
      await this.actor.update({ "data": { "pericias": newPericias } });
      $(input).val(newVal);
      ui.notifications.info(`${skillName}: ${newVal}`);
    });

    // Save on blur to persist quick edits
    root.on("blur", "input, textarea", (ev) => {
      const form = this.element.find("form");
      if (form.length) form.submit();
    });
  }

  // Helper: find actor object robustly
  _getActorFromContext() {
    if (this.actor) return this.actor;
    // try dataset
    try {
      const el = this.element.closest(".app");
      const actorId = el?.dataset?.actorId || this.element.attr("data-actor-id");
      if (actorId) {
        const actor = game.actors.get(actorId) || canvas.tokens?.get(actorId)?.actor;
        if (actor) return actor;
      }
    } catch (err) { /* ignore */ }
    return null;
  }

  // Helper: get current value from sheet input if present, otherwise from actor data (multiple fallbacks)
  _getFieldValueFromSheetOrActor(fieldName) {
    // fieldName example: "data.pericias.Primeiros Socorros" or "data.atributos.DES"
    // 1) Try to read the input from the rendered sheet (unsaved edits)
    try {
      const selector = `[name="${fieldName}"]`;
      const el = this.element.find(selector);
      if (el && el.length) {
        const v = el.val();
        if (v !== undefined && v !== null && v !== "") return Number(v);
      }
    } catch (err) {
      // ignore selector errors
    }

    // 2) fallback to actor data
    const actor = this._getActorFromContext();
    if (!actor) return 0;
    const actorSys = actor.system || actor.data?.data || actor.data || {};
    // parse fieldName
    const parts = fieldName.split(".");
    // remove leading "data" if present
    const startIdx = parts[0] === "data" ? 1 : 0;
    let cur = actorSys;
    for (let i = startIdx; i < parts.length; i++) {
      const key = parts[i];
      if (cur == null) return 0;
      // handle keys with spaces (perícia names)
      if (cur[key] === undefined) {
        // try to find with exact key in cur (object may have different shape)
        const foundKey = Object.keys(cur).find(k => k === key);
        if (foundKey) cur = cur[foundKey];
        else return 0;
      } else cur = cur[key];
    }
    return Number(cur) || 0;
  }

  _onUploadPhoto(event) {
    event.preventDefault();
    const fp = new FilePicker({
      type: "image",
      callback: (path) => {
        const actor = this._getActorFromContext();
        if (!actor) return ui.notifications.warn("Salve a ficha primeiro para definir a foto.");
        actor.update({ img: path });
      }
    });
    fp.render(true);
  }

  // Perícia roll with proper reading of current values
  async _onRollPericia(event) {
    event.preventDefault();
    const button = event.currentTarget;
    const skill = button.dataset.skill;
    if (!skill) return ui.notifications.warn("Perícia não definida no botão.");

    // Map perícia -> atributo
    const map = {
      "Atletismo": "FOR",
      "Condução": "DES",
      "Desarmado": "FOR",
      "Dissimulação": "CAR",
      "Evasão": "DES",
      "Vontade": "POD",
      "Furtividade": "DES",
      "Influência": "CAR",
      "Intuição": "INT",
      "Língua Nativa": "INT",
      "Malandragem": "POD",
      "Musculatura": "FOR",
      "Ocultação": "INT",
      "Pesquisa": "INT",
      "Percepção": "INT",
      "Primeiros Socorros": "INT"
    };

    // First, try to read the pericia value from the sheet (unsaved edits)
    const periciaField = `data.pericias.${skill}`;
    const periciaVal = this._getFieldValueFromSheetOrActor(periciaField);

    // Then, read the attribute value either from sheet or actor
    const attrKey = map[skill] || "FOR";
    const attrField = `data.atributos.${attrKey}`;
    const attrVal = this._getFieldValueFromSheetOrActor(attrField);

    const formula = `1d20 + ${attrVal} + ${periciaVal}`;
    try {
      const roll = await new Roll(formula).roll({ async: true });
      const actor = this._getActorFromContext();
      const speaker = actor ? ChatMessage.getSpeaker({ actor }) : {};
      const flavor = `${actor?.name || "Personagem"} — ${skill} (1d20 + ${attrVal} + ${periciaVal})`;
      roll.toMessage({ speaker, flavor });
    } catch (err) {
      console.error("Erro na rolagem:", err);
      ui.notifications.error("Erro ao executar a rolagem.");
    }
  }

  async _onRollIniciativa(event) {
    event.preventDefault();
    // get DES from sheet or actor
    const des = this._getFieldValueFromSheetOrActor("data.atributos.DES");
    const formula = `1d20 + ${des}`;
    try {
      const roll = await new Roll(formula).roll({ async: true });
      const actor = this._getActorFromContext();
      roll.toMessage({ speaker: actor ? ChatMessage.getSpeaker({ actor }) : {}, flavor: `${actor?.name || "Personagem"} — Iniciativa` });
    } catch (err) {
      console.error(err);
      ui.notifications.error("Erro ao rolar iniciativa.");
    }
  }

  async _onRollTaxaCura(event) {
    event.preventDefault();
    const vig = this._getFieldValueFromSheetOrActor("data.atributos.VIG");
    const formula = `1d6 + ${vig}`;
    try {
      const roll = await new Roll(formula).roll({ async: true });
      const actor = this._getActorFromContext();
      roll.toMessage({ speaker: actor ? ChatMessage.getSpeaker({ actor }) : {}, flavor: `${actor?.name || "Personagem"} — Taxa de Cura (1d6 + ${vig})` });
    } catch (err) {
      console.error(err);
      ui.notifications.error("Erro ao rolar taxa de cura.");
    }
  }
}
