export default class AnimationController {

    constructor(actions) {

        this.actions = actions;
        this.current = null;
    }

    play(name) {

        const next = this.actions[name];

        if (!next) return;

        if (this.current === next) return;

        if (this.current) {

            this.current.fadeOut(0.2);
        }

        this.current = next;

        this.current
            .reset()
            .fadeIn(0.2)
            .play();
    }
}