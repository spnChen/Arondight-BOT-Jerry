const { getDetail, getCharacters } = require('../../utils/api');
const { get, isInside, push, update } = require('../../utils/database');
const render = require('../../utils/render');
const lodash = require('lodash');

const generateImage = ( uid, groupID ) => {
    let data = get('info', 'user', {uid});
    render(data, 'genshin-info', groupID);
}

module.exports = Message => {
    let msg = Message.raw_message;
    let userID = Message.user_id;
    let groupID = Message.group_id;
    let id = msg.match(/\d+/g);

    if (id.length > 1 || id[0].length !== 9 || (id[0][0] !== '1' && id[0][0] !== '5')) {
        bot.sendGroupMsg(groupID, "输入 UID 不合法").then();
        return;
    }

    let uid = parseInt(id[0]);
    let region = id[0][0] === '1' ? 'cn_gf01' : 'cn_qd01';

    if (!isInside('character', 'user', 'userID', userID)) {
        push('character', 'user', {userID, uid: 0});
    }
    if (!isInside('time', 'user', 'uid', uid)) {
        push('time', 'user', {uid, time: 0});
    }
    if (!isInside('info', 'user', 'uid', uid)) {
        let initData = {
            retcode: 19260817,
            message: "",
            level: -1,
            nickname: "",
            uid,
            avatars: [],
            stats: {},
            explorations: []
        };
        push('info', 'user', initData);
    }

    let nowTime = new Date().valueOf();
    let lastTime = get('time', 'user', {uid}).time;

    if (nowTime - lastTime >= 60 * 60 * 1000) {
        update('time', 'user', {uid}, {time: nowTime});
        update('character', 'user', {userID}, {uid});

        getDetail(uid, region)
            .then(res => {
                if (res.retcode === 0) {
                    let detailInfo = res.data;
                    update('info', 'user', {uid}, {
                        retcode:        parseInt(res.retcode),
                        message:        res.message,
                        stats:          detailInfo.stats,
                        explorations:   detailInfo.world_explorations
                    });
                    bot.logger.info("用户 " + uid + " 查询成功，数据已缓存");

                    let characterList = [];
                    let avatarList = detailInfo.avatars;

                    for (let i in avatarList) {
                        if (avatarList.hasOwnProperty(i)) {
                            characterList.push(avatarList[i].id);
                        }
                    }

                    getCharacters(uid, region, characterList)
                        .then(res => {
                            let characterInfo = res.data.avatars;

                            for (let id in characterList) {
                                if (characterList.hasOwnProperty(id)) {
                                    let character = characterInfo.find(el => el["id"] === characterList[id]);
                                    let avatar = avatarList.find(el => el["id"] === characterList[id]);

                                    avatar.weapon = lodash.omit(character.weapon, ['id', 'type', 'promote_level', 'type_name']);
                                    avatar.artifact = [];
                                    avatar.constellationNum = 0;

                                    for (let posID in character.reliquaries) {
                                        if (character.reliquaries.hasOwnProperty(posID)) {
                                            let posInfo = lodash.pick(character.reliquaries[posID], ['name', 'icon', 'pos', 'rarity', 'level']);
                                            avatar.artifact.push(posInfo);
                                        }
                                    }

                                    let constellations = character['constellations'].reverse();
                                    for (let i in constellations) {
                                        if (constellations.hasOwnProperty(i)) {
                                            if (constellations[i]['is_actived']) {
                                                avatar.constellationNum = constellations[i]['pos'];
                                                break;
                                            }
                                        }
                                    }

                                    let target = avatarList.filter(item => characterList[id] === item.id);
                                    target = avatar;
                                }
                            }

                            update('info', 'user', {uid}, {
                                avatars: avatarList
                            });
                        })
                        .catch(err => {
                            bot.logger.error(err);
                        });

                    generateImage(uid, groupID);
                } else {
                    bot.sendGroupMsg(groupID, "米游社接口报错: " + res.message).then();
                    update('info', 'user', {uid}, {
                        retcode: parseInt(res.retcode),
                        message: res.message,
                    });
                }
            })
            .catch(err => {
                bot.logger.error(err);
            });
    } else {
        bot.logger.info("用户 " + uid + " 在一小时内进行过查询操作，将返回上次数据");
        let userInfo = get('info', 'user', {uid});
        if (userInfo.retcode !== 0) {
            bot.sendGroupMsg(groupID, "米游社接口报错: " + userInfo.message).then();
        } else {
            generateImage(uid, groupID);
        }
    }
}