import asyncio
import random
import datetime as dt  # Menggunakan alias dt untuk datetime

from gc import get_objects
from asyncio import sleep
from pyrogram.raw.functions.messages import DeleteHistory, StartBot
from pyrogram.errors.exceptions import *
from pyrogram.errors.exceptions.not_acceptable_406 import ChannelPrivate
from pyrogram.enums import ChatType
from pyrogram.types import InputTextMessageContent, InlineQueryResultArticle
from typing import Dict, List, Union, Any  # Import type annotations yang diperlukan

from PyroUbot import *

__MODULE__ = ""
__HELP__ = """
<blockquote><b>Bantuan Broadcast

perintah : <code>{0}gikes</code>

type : all , users , group

all untuk semua , users untuk user, group untuk group

perintah : <code>{0}stopg</code>
    untuk menghentikan proses gikes yang sedang berlangsung

perintah : <code>{0}bcfd</code> or <code>{0}cfd</code>
    mengirim pesan siaran secara forward

perintah : <code>{0}send</code>
    mengirim pesan ke user/group/channel

perintah : <code>{0}autobc</code>
    mengirim pesan siaran secara otomatis

query:
    |on/off |text |delay |remove |limit |timer |timer_off |timer_status</b></blockquote>
"""

# Menambahkan variabel global untuk menyimpan fitur-fitur yang sedang aktif
AG = []  # Auto Gcast active user IDs
LT = []  # Limit check active user IDs
timer_checker_users = []  # Timer checker active user IDs

# Fungsi untuk inisialisasi fitur yang sebelumnya aktif
async def init_active_features():
    # Cek dan aktifkan kembali fitur autobc yang sebelumnya aktif
    for client in ubot._ubot:
        autobc_active = await get_vars(client.me.id, "AUTO_GCAST_ACTIVE")
        if autobc_active and client.me.id not in AG:
            AG.append(client.me.id)
            # Aktifkan kembali autobc untuk user ini
            asyncio.create_task(autobc_task(client))
            
        limit_active = await get_vars(client.me.id, "AUTO_LIMIT_CHECK_ACTIVE")
        if limit_active and client.me.id not in LT:
            LT.append(client.me.id)
            # Aktifkan kembali limit check untuk user ini
            asyncio.create_task(limit_check_task(client))
            
        # Cek dan aktifkan kembali timer checker untuk user yang memiliki timer aktif
        timer_settings = await get_vars(client.me.id, "AUTOBC_TIMER")
        if timer_settings and timer_settings.get("enabled") and client.me.id not in timer_checker_users:
            timer_checker_users.append(client.me.id)
            # Aktifkan kembali timer checker untuk user ini
            asyncio.create_task(timer_checker_task(client))

# Jalankan inisialisasi saat bot dimulai
asyncio.create_task(init_active_features())

# Helper function untuk memeriksa apakah waktu saat ini berada di antara waktu mulai dan akhir
# Helper function untuk memeriksa apakah waktu saat ini berada di antara waktu mulai dan akhir
def is_time_between(start_time, end_time, current_time):
    """
    Memeriksa apakah current_time berada di antara start_time dan end_time.
    Semua waktu harus dalam format "HH:MM".
    """
    # Konversi string ke objek datetime
    start = dt.datetime.strptime(start_time, "%H:%M")
    end = dt.datetime.strptime(end_time, "%H:%M")
    current = dt.datetime.strptime(current_time, "%H:%M")
    
    # Menangani kasus di mana waktu akhir ada di hari berikutnya
    if end < start:
        return start <= current or current <= end
    else:
        return start <= current <= end

# Fungsi untuk memeriksa timer dan mengaktifkan/menonaktifkan autobc secara otomatis
async def timer_checker_task(client):
    try:
        brhsl = await EMO.BERHASIL(client)
        ggl = await EMO.GAGAL(client)
        
        while client.me.id in timer_checker_users:
            timer_settings = await get_vars(client.me.id, "AUTOBC_TIMER") or {}
            
            if timer_settings.get("enabled"):
                start_time = timer_settings.get("start_time")
                end_time = timer_settings.get("end_time")
                
                if start_time and end_time:
                    # Dapatkan waktu saat ini
                    now = dt.datetime.now().strftime("%H:%M")
                    
                    # Periksa apakah waktu saat ini berada dalam waktu siaran terjadwal
                    should_be_active = is_time_between(start_time, end_time, now)
                    
                    # Jika seharusnya aktif tapi tidak aktif saat ini
                    if should_be_active and client.me.id not in AG:
                        # Pastikan kita memiliki pesan auto text
                        auto_text_vars = await get_vars(client.me.id, "AUTO_TEXT")
                        if auto_text_vars:
                            # Set flag bahwa autobc aktif
                            await set_vars(client.me.id, "AUTO_GCAST_ACTIVE", True)
                            AG.append(client.me.id)
                            # Jalankan autobc di background
                            asyncio.create_task(autobc_task(client))
                            
                            # Catat bahwa autobc dimulai oleh timer
                            try:
                                await client.send_message(
                                    client.me.id, 
                                    f"{brhsl}Auto gcast diaktifkan oleh timer pada {now}"
                                )
                            except Exception:
                                pass
                    
                    # Jika seharusnya tidak aktif tapi aktif saat ini
                    elif not should_be_active and client.me.id in AG:
                        # Set flag bahwa autobc tidak aktif
                        await set_vars(client.me.id, "AUTO_GCAST_ACTIVE", False)
                        AG.remove(client.me.id)
                        
                        # Catat bahwa autobc dihentikan oleh timer
                        try:
                            await client.send_message(
                                client.me.id, 
                                f"{brhsl}Auto gcast dinonaktifkan oleh timer pada {now}"
                            )
                        except Exception:
                            pass
            
            # Periksa setiap menit
            await asyncio.sleep(60)
    except Exception as e:
        print(f"Error in timer_checker_task: {e}")
        if client.me.id in timer_checker_users:
            timer_checker_users.remove(client.me.id)

# Modified autobc_task function to handle message references
# fix by @hiyaok
async def autobc_task(client):
    try:
        done = 0
        while client.me.id in AG:
            delay = await get_vars(client.me.id, "DELAY_GCAST") or 1
            auto_messages = await get_vars(client.me.id, "AUTO_TEXT") or {}
            
            # Convert to new format if needed
            if isinstance(auto_messages, list):  # Perbaikan: menggunakan lowercase list
                auto_messages = {"default": auto_messages}
            
            # Get broadcast mode (copy or forward)
            forward_mode = await get_vars(client.me.id, "AUTOBC_FORWARD_MODE") or False
            
            if not auto_messages or not auto_messages.get("default", []):
                if not any(auto_messages.values()):  # Check if any group has messages
                    AG.remove(client.me.id)
                    await set_vars(client.me.id, "AUTO_GCAST_ACTIVE", False)
                    break
            
            blacklist = await get_list_from_vars(client.me.id, "BL_ID")
            bcs = await EMO.BROADCAST(client)
            brhsl = await EMO.BERHASIL(client)
            mng = await EMO.MENUNGGU(client)
            ggl = await EMO.GAGAL(client)
            
            group_count = 0
            groups_with_messages = {}  # Track which groups received messages
            
            # Get all dialogs (chats) first
            dialogs = []
            async for dialog in client.get_dialogs():
                if (
                    dialog.chat.type in (ChatType.GROUP, ChatType.SUPERGROUP)
                    and dialog.chat.id not in blacklist
                    and dialog.chat.id not in BLACKLIST_CHAT
                ):
                    dialogs.append(dialog)
            
            # Process each dialog
            for dialog in dialogs:
                chat_id = str(dialog.chat.id)
                
                # Determine which message set to use for this group
                if chat_id in auto_messages and auto_messages[chat_id]:
                    # Use group-specific messages
                    group_messages = auto_messages[chat_id]
                    msg_data = random.choice(group_messages)
                elif "default" in auto_messages and auto_messages["default"]:
                    # Use default messages
                    group_messages = auto_messages["default"]
                    msg_data = random.choice(group_messages)
                else:
                    # Skip this group as no messages are available
                    continue
                
                # Prepare the message to broadcast
                source_msg = None
                text_content = None
                missing_message = False
                
                if isinstance(msg_data, dict):  # New format
                    if msg_data.get("type") == "message_ref":
                        # Try to get the referenced message
                        try:
                            ref_chat_id = msg_data.get("chat_id")
                            message_id = msg_data.get("message_id")
                            source_msg = await client.get_messages(ref_chat_id, message_id)
                            if not source_msg:
                                missing_message = True
                        except Exception:
                            missing_message = True
                    elif msg_data.get("type") == "text":
                        text_content = msg_data.get("content")
                else:  # Legacy format (just text)
                    text_content = msg_data
                
                # If the message no longer exists
                if missing_message:
                    # Remove the missing message from auto_messages
                    target_key = chat_id if chat_id in auto_messages else "default"
                    auto_messages[target_key] = [m for m in auto_messages[target_key] if not (
                        isinstance(m, dict) and
                        m.get("type") == "message_ref" and
                        m.get("chat_id") == msg_data.get("chat_id") and
                        m.get("message_id") == msg_data.get("message_id")
                    )]
                    
                    # Continue to next dialog
                    continue
                
                # Attempt to send message
                try:
                    await asyncio.sleep(1)
                    if source_msg:
                        if forward_mode:
                            # Use forward if in forward mode
                            await source_msg.forward(dialog.chat.id)
                        else:
                            # Use copy to preserve premium emoji (default)
                            await source_msg.copy(dialog.chat.id)
                    else:
                        await client.send_message(dialog.chat.id, text_content)
                    
                    group_count += 1
                    groups_with_messages[dialog.chat.title] = chat_id
                except FloodWait as e:
                    await asyncio.sleep(e.value)
                    try:
                        if source_msg:
                            if forward_mode:
                                await source_msg.forward(dialog.chat.id)
                            else:
                                await source_msg.copy(dialog.chat.id)
                        else:
                            await client.send_message(dialog.chat.id, text_content)
                        
                        group_count += 1
                        groups_with_messages[dialog.chat.title] = chat_id
                    except Exception:
                        pass
                except Exception:
                    pass
            
            # Save updated auto_messages to remove any missing messages
            await set_vars(client.me.id, "AUTO_TEXT", auto_messages)
            
            if client.me.id not in AG:
                break
            
            done += 1
            
            # Prepare detailed report of sent messages
            report = f"{bcs}auto_gcat done (Mode: {'FORWARD' if forward_mode else 'COPY'})\n"
            report += f"putaran {done}\n"
            report += f"{brhsl}ucce {group_count} group\n"
            
            # Add details of which groups received messages (limited to first 10)
            if groups_with_messages:
                groups_list = list(groups_with_messages.items())
                report += "\nDetail grup (max 10):\n"
                for i, (group_name, group_id) in enumerate(groups_list[:10], 1):
                    msg_type = "Khusus" if group_id in auto_messages else "Default"
                    report += f"{i}. {group_name} - {msg_type}\n"
                
                if len(groups_list) > 10:
                    report += f"...dan {len(groups_list) - 10} grup lainnya\n"
            
            report += f"\n{mng}wait {delay} minute"
            
            # Kirim pesan status ke private chat user
            try:
                await client.send_message(client.me.id, report)
            except Exception:
                pass
            
            await asyncio.sleep(int(60 * int(delay)))
    except Exception as e:
        print(f"Error in autobc_task: {e}")
        if client.me.id in AG:
            AG.remove(client.me.id)
            await set_vars(client.me.id, "AUTO_GCAST_ACTIVE", False)

# Fungsi untuk menjalankan limit check sebagai task terpisah
async def limit_check_task(client):
    try:
        while client.me.id in LT:
            for x in range(2):
                cmd_message = await client.send_message(client.me.id, ".limit")
                await limit_cmd(client, cmd_message)
                await asyncio.sleep(5)
            await asyncio.sleep(1200)  # 20 menit
    except Exception as e:
        print(f"Error in limit_check_task: {e}")
        if client.me.id in LT:
            LT.remove(client.me.id)
            await set_vars(client.me.id, "AUTO_LIMIT_CHECK_ACTIVE", False)

async def limit_cmd(client, message):
    ggl = await EMO.GAGAL(client)
    sks = await EMO.BERHASIL(client)
    prs = await EMO.PROSES(client)
    pong = await EMO.PING(client)
    tion = await EMO.MENTION(client)
    yubot = await EMO.UBOT(client)
    await client.unblock_user("SpamBot")
    bot_info = await client.resolve_peer("SpamBot")
    msg = await message.reply(f"{prs}processing . . .")
    response = await client.invoke(
        StartBot(
            bot=bot_info,
            peer=bot_info,
            random_id=client.rnd_id(),
            start_param="start",
        )
    )
    await sleep(1)
    await msg.delete()
    status = await client.get_messages("SpamBot", response.updates[1].message.id + 1) 
    if status and hasattr(status, "text"):
        pjg = len(status.text)
        print(pjg)
        if pjg <= 100:
            if client.me.is_premium:
                text = f"""
<blockquote>{pong} ss   : 
{tion}   :    s
{yubot}  : {bot.me.mention}</blockquote>
"""
            else:
                text = f"""
<blockquote>ss  :    
  :    s
 : {bot.me.mention}</blockquote>
"""
            await client.send_message(message.chat.id, text)
            return await client.invoke(DeleteHistory(peer=bot_info, max_id=0, revoke=True))
        else:
            if client.me.is_premium:
                text = f"""
<blockquote>{pong} ss   : 
{tion}   :   s
{yubot}  : {bot.me.mention}</blockquote>
"""
            else:
                text = f"""
<blockquote>ss  :    
  :   s
 : {bot.me.mention}</blockquote>
"""
            await client.send_message(message.chat.id, text)
            return await client.invoke(DeleteHistory(peer=bot_info, max_id=0, revoke=True))
    else:
        print("Status tidak valid atau status.text tidak ada")

gcast_progress = []

@PY.UBOT("bc|gikes")
@PY.TOP_CMD
async def gcast_handler(client, message):
    global gcast_progress
    gcast_progress.append(client.me.id)
    
    prs = await EMO.PROSES(client)
    sks = await EMO.BERHASIL(client)
    ggl = await EMO.GAGAL(client)
    bcs = await EMO.BROADCAST(client)
    ktrng = await EMO.BL_KETERANGAN(client)    
    _msg = f"<b>{prs}ss...</b>"
    gcs = await message.reply(_msg)    
    command, text = extract_type_and_msg(message)

    if command not in ["group", "users", "all"] or not text:
        gcast_progress.remove(client.me.id)
        return await gcs.edit(f"<blockquote><code>{message.text.split()[0]}</code> <b>[] [x/]</b> {ggl}</blockquote>")
    chats = await get_data_id(client, command)
    blacklist = await get_list_from_vars(client.me.id, "BL_ID")

    done = 0
    failed = 0
    for chat_id in chats:
        if client.me.id not in gcast_progress:
            await gcs.edit(f"<blockquote><b>ss s s   !</b> {sks}</blockquote>")
            return
        if chat_id in blacklist or chat_id in BLACKLIST_CHAT:
            continue

        try:
            if message.reply_to_message:
                # Copy pesan dengan semua atribut termasuk emoji premium
                await message.reply_to_message.copy(chat_id)
            else:
                await client.send_message(chat_id, text)
            done += 1
        except FloodWait as e:
            await asyncio.sleep(e.value)
            try:
                if message.reply_to_message:
                    await text.copy(chat_id)
                else:
                    await client.send_message(chat_id, text)
                done += 1
            except (Exception, ChannelPrivate):
                failed += 1
        except (Exception, ChannelPrivate):
            failed += 1

    gcast_progress.remove(client.me.id)
    await gcs.delete()
    _gcs = f"""
<blockquote><b>{bcs}s </b></blockquote>
<blockquote><b>{sks}s : {done} </b>
<b>{ggl} : {failed} </b>
<b>{ktrng} :</b> <code>{command}</code></blockquote>

"""
    return await message.reply(_gcs)

@PY.UBOT("stopg")
@PY.TOP_CMD
async def stopg_handler(client, message):
    sks = await EMO.BERHASIL(client)
    ggl = await EMO.GAGAL(client)
    global gcast_progress
    if client.me.id in gcast_progress:
        gcast_progress.remove(client.me.id)
        return await message.reply(f"<blockquote><b>s s  </b> {sks}</blockquote>")
    else:
        return await message.reply(f"<blockquote><b>{ggl}  s !!!</b></blockquote>")

@PY.UBOT("bcfd|cfd")
@PY.TOP_CMD
async def _(client, message):
    prs = await EMO.PROSES(client)
    brhsl = await EMO.BERHASIL(client)
    ggl = await EMO.GAGAL(client)
    bcs = await EMO.BROADCAST(client)
    
    _msg = f"{prs}proceing..."
    gcs = await message.reply(_msg)

    command, text = extract_type_and_msg(message)
    
    if command not in ["group", "users", "all"] or not text:
        return await gcs.edit(f"{ggl}{message.text.split()[0]} type [reply]")

    if not message.reply_to_message:
        return await gcs.edit(f"{ggl}{message.text.split()[0]} type [reply]")

    chats = await get_data_id(client, command)
    blacklist = await get_list_from_vars(client.me.id, "BL_ID")

    done = 0
    failed = 0
    for chat_id in chats:
        if chat_id in blacklist or chat_id in BLACKLIST_CHAT:
            continue

        try:
            if message.reply_to_message:
                await message.reply_to_message.forward(chat_id)
            else:
                await text.forward(chat_id)
            done += 1
        except FloodWait as e:
            await asyncio.sleep(e.value)
            if message.reply_to_message:
                await message.reply_to_message.forward(chat_id)
            else:
                await text.forward(chat_id)
            done += 1
        except Exception:
            failed += 1
            pass

    await gcs.delete()
    _gcs = f"""
<blockquote><b>{bcs}s  </blockquote></b>
<blockquote><b>{brhsl} ss {done} </b>
<b>{ggl}  {failed} </blockquote></b>

"""
    return await message.reply(_gcs)


@PY.BOT("bcast")
@PY.ADMIN
async def _(client, message):
    msg = await message.reply("<blockquote><b>okee proses Boy...</blockquote></b>\n\n<blockquote><b>mohon bersabar untuk menunggu proses broadcast sampai selesai</blockquote></b>", quote=True)

    send = get_message(message)
    if not send:
        return await msg.edit("mohon bala atau ketik euatu...")
        
    susers = await get_list_from_vars(client.me.id, "SAVED_USERS")
    done = 0
    for chat_id in susers:
        try:
            if message.reply_to_message:
                await send.forward(chat_id)
            else:
                await client.send_message(chat_id, send)
            done += 1
        except FloodWait as e:
            await asyncio.sleep(e.value)
            if message.reply_to_message:
                await send.forward(chat_id)
            else:
                await client.send_message(chat_id, send)
            done += 1
        except Exception:
            pass

    return await msg.edit(f"<blockquote><b>Pesan broadcast berhasil terkirim ke {done} user</blockquote></b>\n\n<blockquote><b>`USERBOT 5k/BULAN BY` @ElainaUserbot</b></blockquote>")


@PY.UBOT("addbl")
@PY.TOP_CMD
@PY.GROUP
async def _(client, message):
    prs = await EMO.PROSES(client)
    grp = await EMO.BL_GROUP(client)
    ktrn = await EMO.BL_KETERANGAN(client)
    _msg = f"{prs}proceing..."

    msg = await message.reply(_msg)
    try:
        chat_id = message.chat.id
        blacklist = await get_list_from_vars(client.me.id, "BL_ID")

        if chat_id in blacklist:
            txt = f"""
<blockquote><b>{grp} : {message.chat.title}</blockquote></b>
<blockquote><b>{ktrn} : s   s Blacklist</blockquote></b>

<blockquote><b>USERBOT 5k/BULAN BY @ElainaUserbot</b></blockquote>
"""
        else:
            await add_to_vars(client.me.id, "BL_ID", chat_id)
            txt = f"""
<blockquote><b>{grp} : {message.chat.title}</blockquote></b>\n<blockquote><b>{ktrn} : s     s Blacklist</blockquote></b>

<blockquote><b>USERBOT 5k/BULAN BY @ElainaUserbot</b></blockquote>
"""

        return await msg.edit(txt)
    except Exception as error:
        return await msg.edit(str(error))


@PY.UBOT("unbl")
@PY.TOP_CMD
@PY.GROUP
async def _(client, message):
    prs = await EMO.PROSES(client)
    grp = await EMO.BL_GROUP(client)
    ktrn = await EMO.BL_KETERANGAN(client)
    _msg = f"{prs}proceing..."

    msg = await message.reply(_msg)
    try:
        chat_id = get_arg(message) or message.chat.id
        blacklist = await get_list_from_vars(client.me.id, "BL_ID")

        if chat_id not in blacklist:
            response = f"""
<blockquote><b>{grp} : {message.chat.title}</blockquote></b>
<blockquote><b>{ktrn} :    s Blacklist</b></blockquote>

<blockquote><b>USERBOT 5k/BULAN BY @ElainaUserbot</b></blockquote>
"""
        else:
            await remove_from_vars(client.me.id, "BL_ID", chat_id)
            response = f"""
<blockquote><b>{grp} : {message.chat.title}</blockquote ></b>
<blockquote><b>{ktrn} : s  s   s Blacklist</blockquote></b>

<blockquote><b>USERBOT 5k/BULAN BY @ElainaUserbot</b></blockquote>
"""

        return await msg.edit(response)
    except Exception as error:
        return await msg.edit(str(error))

# Perbaikan untuk fungsi listbl pada broadcast.py
@PY.UBOT("listbl")
@PY.TOP_CMD
async def _(client, message):
    prs = await EMO.PROSES(client)
    brhsl = await EMO.BERHASIL(client)
    ktrng = await EMO.BL_KETERANGAN(client)
    _msg = f"{prs}proceꜱꜱing..."
    mzg = await message.reply(_msg)

    blacklist = await get_list_from_vars(client.me.id, "BL_ID")
    total_blacklist = len(blacklist)

    list_text = f"{brhsl} daftar blackliꜱt\n"

    for chat_id in blacklist:
        try:
            chat = await client.get_chat(chat_id)
            list_text += f" ├ {chat.title} | {chat.id}\n"
        except:
            list_text += f" ├ {chat_id}\n"

    list_text += f"{ktrng} total blackliꜱt {total_blacklist}"
    return await mzg.edit(list_text)

@PY.UBOT("rallbl")
@PY.TOP_CMD
async def _(client, message):
    prs = await EMO.PROSES(client)
    ggl = await EMO.GAGAL(client)
    brhsl = await EMO.BERHASIL(client)
    _msg = f"{prs}proceing..."

    msg = await message.reply(_msg)
    blacklists = await get_list_from_vars(client.me.id, "BL_ID")

    if not blacklists:
        return await msg.edit(f"{ggl}blacklit broadcat anda koong")

    for chat_id in blacklists:
        await remove_from_vars(client.me.id, "BL_ID", chat_id)

    await msg.edit(f"{brhsl}emua blacklit broadcat berhail di hapu")


@PY.UBOT("send")
@PY.TOP_CMD
async def _(client, message):
    if message.reply_to_message:
        chat_id = (
            message.chat.id if len(message.command) < 2 else message.text.split()[1]
        )
        try:
            if client.me.id != bot.me.id:
                if message.reply_to_message.reply_markup:
                    x = await client.get_inline_bot_results(
                        bot.me.username, f"get_send {id(message)}"
                    )
                    return await client.send_inline_bot_result(
                        chat_id, x.query_id, x.results[0].id
                    )
        except Exception as error:
            return await message.reply(error)
        else:
            try:
                # Mendukung emoji premium dengan copy pesan asli
                return await message.reply_to_message.copy(chat_id)
            except Exception as t:
                return await message.reply(f"{t}")
    else:
        if len(message.command) < 3:
            return await message.reply("Ketik yang bener kntl")
        chat_id, chat_text = message.text.split(None, 2)[1:]
        try:
            if "_" in chat_id:
                msg_id, to_chat = chat_id.split("_")
                return await client.send_message(
                    to_chat, chat_text, reply_to_message_id=int(msg_id)
                )
            else:
                # Kirim pesan dengan dukungan emoji premium
                return await client.send_message(chat_id, chat_text)
        except Exception as t:
            return await message.reply(f"{t}")


@PY.INLINE("^get_send")
async def _(client, inline_query):
    _id = int(inline_query.query.split()[1])
    m = next((obj for obj in get_objects() if id(obj) == _id), None)
    if m:
        await client.answer_inline_query(
            inline_query.id,
            cache_time=0,
            results=[
                InlineQueryResultArticle(
                    title="get send!",
                    reply_markup=m.reply_to_message.reply_markup,
                    input_message_content=InputTextMessageContent(
                        m.reply_to_message.text
                    ),
                )
            ],
        )

# Fungsi untuk handling copy pesan dengan dukungan emoji premium
async def send_premium_message(client, chat_id, text, reply_to=None):
    """
    Kirim pesan dengan dukungan untuk emoji premium
    
    Args:
        client: Instance client Pyrogram
        chat_id: ID chat tujuan
        text: Teks pesan
        reply_to: ID pesan untuk dibalas (opsional)
    """
    try:
        # Pyrogram 3.0.2 menangani emoji premium secara otomatis saat copy
        return await client.send_message(
            chat_id=chat_id,
            text=text,
            reply_to_message_id=reply_to
        )
    except Exception as e:
        print(f"Error sending premium message: {e}")
        # Fallback to regular message
        return await client.send_message(chat_id, text, reply_to_message_id=reply_to)


# Modified autobc command handler
# by @hiyaok
# Command handler untuk autobc
@PY.UBOT("autobc")
@PY.TOP_CMD
async def _(client, message):
    global AG, LT, timer_checker_users
    prs = await EMO.PROSES(client)
    brhsl = await EMO.BERHASIL(client)
    bcs = await EMO.BROADCAST(client)
    mng = await EMO.MENUNGGU(client)
    ggl = await EMO.GAGAL(client)   
    msg = await message.reply(f"{prs}proceꜱꜱing...")
    
    command_parts = message.text.split()
    command = command_parts[1].lower() if len(command_parts) > 1 else ""
    
    # Extract target group ID if provided (format: command:group_id)
    target_group = None
    if ":" in command:
        command, target_group = command.split(":", 1)
    
    # Get remaining text (skip the first two parts: command and subcommand)
    value = " ".join(command_parts[2:]) if len(command_parts) > 2 else ""
    
    # Get current auto_text settings
    auto_text_vars = await get_vars(client.me.id, "AUTO_TEXT") or {}
    
    # Convert to new format if needed
    if isinstance(auto_text_vars, list):  # Perbaikan: menggunakan lowercase list
        auto_text_vars = {"default": auto_text_vars}
        await set_vars(client.me.id, "AUTO_TEXT", auto_text_vars)
    
    if command == "on":
        if not auto_text_vars or not any(auto_text_vars.values()):
            return await msg.edit(
                f"{ggl}harap etting text terlebih dahulu"
            )

        # Check if the command includes the "forward" option
        forward_mode = False
        if value and value.lower() == "forward":
            forward_mode = True
            await set_vars(client.me.id, "AUTOBC_FORWARD_MODE", True)
        else:
            await set_vars(client.me.id, "AUTOBC_FORWARD_MODE", False)

        if client.me.id not in AG:
            # Set flag di database bahwa autobc aktif
            await set_vars(client.me.id, "AUTO_GCAST_ACTIVE", True)
            mode_text = "FORWARD" if forward_mode else "COPY"
            await msg.edit(f"{brhsl}auto gcat di aktifkan (Mode: {mode_text})")
            
            AG.append(client.me.id)
            # Jalankan autobc task di background
            asyncio.create_task(autobc_task(client))
        else:
            return await msg.delete()

    elif command == "off":
        if client.me.id in AG:
            AG.remove(client.me.id)
            # Set flag di database bahwa autobc nonaktif
            await set_vars(client.me.id, "AUTO_GCAST_ACTIVE", False)
            return await msg.edit(f"{brhsl}auto gcast dinonaktifkan")
        else:
            return await msg.delete()

    elif command == "timer":
        # Format yang diharapkan: "7:00-12:00" untuk mengatur timer dari jam 7 pagi hingga jam 12 siang
        if not value or "-" not in value:
            return await msg.edit(
                f"{ggl}{message.text.split()[0]} timer - [start_time-end_time] (format: HH:MM-HH:MM)"
            )
        
        try:
            start_time, end_time = value.split("-")
            # Validasi format waktu
            start_hours, start_minutes = map(int, start_time.strip().split(":"))
            end_hours, end_minutes = map(int, end_time.strip().split(":"))
            
            if not (0 <= start_hours < 24 and 0 <= start_minutes < 60 and 
                    0 <= end_hours < 24 and 0 <= end_minutes < 60):
                return await msg.edit(f"{ggl}Format waktu tidak valid. Gunakan format 24 jam (HH:MM).")
            
            # Simpan pengaturan timer
            timer_settings = {
                "enabled": True,
                "start_time": f"{start_hours:02d}:{start_minutes:02d}",
                "end_time": f"{end_hours:02d}:{end_minutes:02d}"
            }
            await set_vars(client.me.id, "AUTOBC_TIMER", timer_settings)
            
            # Mulai timer checker task jika belum berjalan
            if client.me.id not in timer_checker_users:
                timer_checker_users.append(client.me.id)
                asyncio.create_task(timer_checker_task(client))
            
            return await msg.edit(
                f"{brhsl}Timer auto broadcast berhasil diatur dari {start_time} sampai {end_time}"
            )
        except Exception as e:
            return await msg.edit(f"{ggl}Error: {str(e)}")
            
    elif command == "timer_off":
        timer_settings = await get_vars(client.me.id, "AUTOBC_TIMER") or {}
        if timer_settings:
            timer_settings["enabled"] = False
            await set_vars(client.me.id, "AUTOBC_TIMER", timer_settings)
            if client.me.id in timer_checker_users:
                timer_checker_users.remove(client.me.id)
            return await msg.edit(f"{brhsl}Timer auto broadcast dinonaktifkan")
        else:
            return await msg.edit(f"{ggl}Timer belum diatur")
            
    elif command == "timer_status":
        timer_settings = await get_vars(client.me.id, "AUTOBC_TIMER") or {}
        if not timer_settings:
            return await msg.edit(f"{ggl}Timer belum diatur")
            
        enabled = timer_settings.get("enabled", False)
        start_time = timer_settings.get("start_time", "")
        end_time = timer_settings.get("end_time", "")
        
        status = "Aktif" if enabled else "Nonaktif"
        return await msg.edit(
            f"{brhsl}Status timer:\n"
            f" Status: {status}\n"
            f" Waktu mulai: {start_time}\n"
            f" Waktu selesai: {end_time}"
        )

    elif command == "text":
        # Memastikan target_group yang valid
        if target_group:
            try:
                # Coba mengonversi ke int jika bukan "default"
                if target_group.lower() != "default":
                    target_group_id = int(target_group)
                    # Dapatkan informasi grup untuk konfirmasi
                    try:
                        group_info = await client.get_chat(target_group_id)
                        group_name = group_info.title
                    except:
                        group_name = f"Grup ID: {target_group_id}"
                else:
                    target_group_id = "default"
                    group_name = "Default (Semua grup)"
            except ValueError:
                return await msg.edit(f"{ggl}ID grup tidak valid: {target_group}")
        else:
            target_group_id = "default"
            group_name = "Default (Semua grup)"
        
        # Store message if replying to a message (support premium emoji)
        if message.reply_to_message:
            await add_auto_message(client, message, target_group=target_group_id)
            return await msg.edit(f"{brhsl}pesan berhasil disimpan untuk {group_name} (dengan dukungan emoji premium)")
        # Store text
        elif value:
            await add_auto_message(client, message, value, target_group=target_group_id)
            return await msg.edit(f"{brhsl}teks berhasil disimpan untuk {group_name}")
        else:
            return await msg.edit(
                f"{ggl}{message.text.split()[0]} text[:group_id] - [value] atau reply ke pesan"
            )

    elif command == "delay":
        if not int(value):
            return await msg.edit(
                f"{ggl}{message.text.split()[0]} delay - [value]"
            )
        await set_vars(client.me.id, "DELAY_GCAST", value)
        return await msg.edit(
            f"{brhsl}barhasil ke setting {value} menit"
        )

    elif command == "remove":
        # Parse nilai untuk perintah remove
        # Format: autobc remove:group_id index atau autobc remove index (untuk default)
        target_key = target_group or "default"
        
        # Jika tidak ada nilai dan bukan "all"
        if not value and value != "all":
            return await msg.edit(
                f"{ggl}{message.text.split()[0]} remove[:group_id] - [index/all]"
            )
        
        # Pastikan target_key ada dalam auto_text_vars
        if target_key not in auto_text_vars:
            return await msg.edit(f"{ggl}Tidak ada pesan untuk grup/kategori ini")
        
        if value == "all":
            if target_key == "default" and len(auto_text_vars) > 1:
                # Hanya hapus pesan default, bukan semua grup
                auto_text_vars["default"] = []
                await set_vars(client.me.id, "AUTO_TEXT", auto_text_vars)
                return await msg.edit(f"{brhsl}semua pesan default berhasil dihapus")
            elif target_key == "all":
                # Hapus semua pesan dari semua grup
                await set_vars(client.me.id, "AUTO_TEXT", {})
                return await msg.edit(f"{brhsl}semua pesan autobc berhasil dihapus")
            else:
                # Hapus pesan dari grup tertentu
                auto_text_vars.pop(target_key, None)
                await set_vars(client.me.id, "AUTO_TEXT", auto_text_vars)
                return await msg.edit(f"{brhsl}semua pesan untuk grup {target_key} berhasil dihapus")
        
        try:
            # Hapus pesan berdasarkan indeks
            index = int(value) - 1
            if 0 <= index < len(auto_text_vars[target_key]):
                auto_text_vars[target_key].pop(index)
                
                # Jika grup tidak memiliki pesan lagi, hapus grup dari daftar
                if not auto_text_vars[target_key] and target_key != "default":
                    auto_text_vars.pop(target_key)
                
                await set_vars(client.me.id, "AUTO_TEXT", auto_text_vars)
                
                group_text = "default" if target_key == "default" else f"grup {target_key}"
                return await msg.edit(
                    f"{brhsl}pesan ke {index+1} untuk {group_text} berhasil dihapus"
                )
            else:
                return await msg.edit(f"{ggl}indeks tidak valid")
        except Exception as error:
            return await msg.edit(str(error))

    elif command == "list":
        if not auto_text_vars or not any(auto_text_vars.values()):
            return await msg.edit(f"{ggl}auto gcast pesan kosong")
        
        # Jika target grup ditentukan, hanya tampilkan pesan untuk grup tersebut
        if target_group:
            if target_group not in auto_text_vars or not auto_text_vars[target_group]:
                return await msg.edit(f"{ggl}Tidak ada pesan untuk grup {target_group}")
            
            txt = f"Daftar pesan untuk grup {target_group}:\n\n"
            for num, x in enumerate(auto_text_vars[target_group], 1):
                if isinstance(x, dict):
                    if x.get("type") == "message_ref":
                        txt += f"{num}> [Pesan dengan ID: {x.get('message_id')}]\n"
                    elif x.get("type") == "text":
                        txt += f"{num}> {x.get('content')}\n\n"
                else:
                    # Legacy format
                    txt += f"{num}> {x}\n\n"
        else:
            # Tampilkan semua pesan dari semua grup
            txt = "Daftar pesan autobc per grup:\n\n"
            
            # Tampilkan pesan default terlebih dahulu
            if "default" in auto_text_vars and auto_text_vars["default"]:
                txt += "DEFAULT (Untuk semua grup):\n"
                for num, x in enumerate(auto_text_vars["default"], 1):
                    if isinstance(x, dict):
                        if x.get("type") == "message_ref":
                            txt += f"  {num}> [Pesan dengan ID: {x.get('message_id')}]\n"
                        elif x.get("type") == "text":
                            content = x.get("content")
                            # Potong konten yang terlalu panjang
                            if len(content) > 50:
                                content = content[:47] + "..."
                            txt += f"  {num}> {content}\n"
                    else:
                        # Legacy format
                        content = x
                        if len(content) > 50:
                            content = content[:47] + "..."
                        txt += f"  {num}> {content}\n"
                txt += "\n"
            
            # Tampilkan pesan untuk grup spesifik
            for group_id, messages in auto_text_vars.items():
                if group_id != "default" and messages:
                    try:
                        # Coba dapatkan info grup
                        group_info = await client.get_chat(int(group_id))
                        group_name = f"{group_info.title} ({group_id})"
                    except:
                        group_name = f"Grup ID: {group_id}"
                    
                    txt += f"{group_name}:\n"
                    for num, x in enumerate(messages, 1):
                        if isinstance(x, dict):
                            if x.get("type") == "message_ref":
                                txt += f"  {num}> [Pesan dengan ID: {x.get('message_id')}]\n"
                            elif x.get("type") == "text":
                                content = x.get("content")
                                if len(content) > 50:
                                    content = content[:47] + "..."
                                txt += f"  {num}> {content}\n"
                        else:
                            # Legacy format
                            content = x
                            if len(content) > 50:
                                content = content[:47] + "..."
                            txt += f"  {num}> {content}\n"
                    txt += "\n"
        
        txt += f"\nUntuk menghapus pesan:\n{message.text.split()[0]} remove[:group_id] [index/all]"
        return await msg.edit(txt)

    elif command == "limit":
        if value == "off":
            if client.me.id in LT:
                LT.remove(client.me.id)
                # Set flag di database bahwa limit check nonaktif
                await set_vars(client.me.id, "AUTO_LIMIT_CHECK_ACTIVE", False)
                return await msg.edit(f"{brhsl}auto cek limit dinonaktifkan")
            else:
                return await msg.delete()

        elif value == "on":
            if client.me.id not in LT:
                # Set flag di database bahwa limit check aktif
                await set_vars(client.me.id, "AUTO_LIMIT_CHECK_ACTIVE", True)
                LT.append(client.me.id)
                await msg.edit(f"{brhsl}auto cek limit started")
                # Jalankan limit check task di background
                asyncio.create_task(limit_check_task(client))
            else:
                return await msg.delete()
        else:
             return await msg.edit(f"{ggl}{message.text.split()[0]} limit - [value]")

    elif command == "mode":
        if value and value.lower() == "forward":
            await set_vars(client.me.id, "AUTOBC_FORWARD_MODE", True)
            return await msg.edit(f"{brhsl}Mode autobc diubah ke FORWARD")
        elif value and value.lower() == "copy":
            await set_vars(client.me.id, "AUTOBC_FORWARD_MODE", False)
            return await msg.edit(f"{brhsl}Mode autobc diubah ke COPY (dengan dukungan emoji premium)")
        else:
            current_mode = await get_vars(client.me.id, "AUTOBC_FORWARD_MODE") or False
            mode_text = "FORWARD" if current_mode else "COPY"
            return await msg.edit(f"{brhsl}Mode autobc saat ini: {mode_text}\n\nUntuk mengubah mode: {message.text.split()[0]} mode [forward/copy]")

    elif command == "add_group":
        if not target_group or not value:
            return await msg.edit(
                f"{ggl}{message.text.split()[0]} add_group:group_id - [text]"
            )
        
        try:
            group_id = int(target_group)
            # Verifikasi grup
            try:
                group_info = await client.get_chat(group_id)
                group_name = group_info.title
            except:
                return await msg.edit(f"{ggl}Grup dengan ID {group_id} tidak ditemukan")
            
            # Tambahkan teks ke grup
            await add_auto_message(client, message, value, target_group=group_id)
            return await msg.edit(f"{brhsl}Teks berhasil ditambahkan untuk grup {group_name}")
        except ValueError:
            return await msg.edit(f"{ggl}ID grup tidak valid: {target_group}")
    
    else:
        usage = f"{ggl}Penggunaan:\n"
        usage += f" {message.text.split()[0]} on - Aktifkan autobc (mode copy)\n"
        usage += f" {message.text.split()[0]} on forward - Aktifkan autobc mode forward\n"
        usage += f" {message.text.split()[0]} off - Nonaktifkan autobc\n"
        usage += f" {message.text.split()[0]} text - Reply pesan untuk menyimpan sebagai default\n"
        usage += f" {message.text.split()[0]} text:group_id - Reply pesan untuk grup tertentu\n"
        usage += f" {message.text.split()[0]} text [teks] - Tambahkan teks default\n"
        usage += f" {message.text.split()[0]} text:group_id [teks] - Tambahkan teks untuk grup tertentu\n"
        usage += f" {message.text.split()[0]} add_group:group_id [teks] - Tambahkan teks untuk grup\n"
        usage += f" {message.text.split()[0]} mode [forward/copy] - Ubah mode broadcast\n"
        usage += f" {message.text.split()[0]} delay [menit] - Atur jeda\n"
        usage += f" {message.text.split()[0]} remove [nomor] - Hapus pesan default\n"
        usage += f" {message.text.split()[0]} remove:group_id [nomor] - Hapus pesan grup\n"
        usage += f" {message.text.split()[0]} remove all - Hapus semua pesan default\n"
        usage += f" {message.text.split()[0]} remove:all all - Hapus semua pesan dari semua grup\n"
        usage += f" {message.text.split()[0]} remove:group_id all - Hapus semua pesan grup tertentu\n"
        usage += f" {message.text.split()[0]} list - Lihat daftar semua pesan\n"
        usage += f" {message.text.split()[0]} list:group_id - Lihat pesan grup tertentu\n"
        usage += f" {message.text.split()[0]} timer [HH:MM-HH:MM] - Atur jadwal aktif otomatis\n"
        usage += f" {message.text.split()[0]} timer_off - Nonaktifkan timer\n"
        usage += f" {message.text.split()[0]} timer_status - Cek status timer\n"
        usage += f" {message.text.split()[0]} limit [on/off] - Aktifkan/nonaktifkan cek limit"
        return await msg.edit(usage)

# Fungsi helper untuk menambahkan teks autobc (legacy)
async def add_auto_text(client, text):
    """Legacy function for backward compatibility"""
    auto_text = await get_vars(client.me.id, "AUTO_TEXT") or []
    # Check if auto_text contains dictionaries already (new format)
    if auto_text and isinstance(auto_text[0], dict):
        auto_text.append({"type": "text", "content": text})
    else:
        # Old format - just append the text
        auto_text.append(text)
    await set_vars(client.me.id, "AUTO_TEXT", auto_text)

# Fungsi helper untuk menambahkan pesan autobc dengan target grup tertentu
async def add_auto_message(client, message, text=None, target_group=None):
    """
    Menambahkan pesan autobc dengan target grup tertentu
    
    Args:
        client: Instance client Pyrogram
        message: Objek pesan Pyrogram
        text: Teks pesan (opsional)
        target_group: ID grup target atau "default" untuk semua grup
    """
    # Retrieve existing auto_messages
    auto_messages = await get_vars(client.me.id, "AUTO_TEXT") or {}
    
    # Convert to new format if needed
    if isinstance(auto_messages, list):
        # Migrate dari format lama (list) ke format baru (dict)
        auto_messages = {"default": auto_messages}
    
    # Set target group to "default" if not specified
    if not target_group:
        target_group = "default"
    
    # Ensure the target group exists in the dictionary
    if target_group not in auto_messages:
        auto_messages[target_group] = []
    
    # If replying to a message, store message reference instead of text
    if message.reply_to_message and not text:
        # Store as a dictionary with message_id and chat_id
        msg_data = {
            "type": "message_ref",
            "chat_id": message.chat.id,
            "message_id": message.reply_to_message.id
        }
        auto_messages[target_group].append(msg_data)
    else:
        # Text storage
        if text:
            msg_data = {
                "type": "text",
                "content": text
            }
            auto_messages[target_group].append(msg_data)
    
    # Save updated auto_messages
    await set_vars(client.me.id, "AUTO_TEXT", auto_messages)

@PY.BOT("bcubot")
@PY.ADMIN
async def broadcast_bot(client, message):
    msg = await message.reply("<b>s ss  s</b>", quote=True)
    done = 0
    if not message.reply_to_message:
        return await msg.edit("<b> s s</b>")
    for x in ubot._ubot:
        try:
            await x.unblock_user(bot.me.username)
            await message.reply_to_message.forward(x.me.id)
            done += 1
        except Exception:
            pass
    return await msg.edit(f" s  s  {done} ")
